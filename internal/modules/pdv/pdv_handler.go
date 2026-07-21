package pdv

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"erp/internal/platform/database/db"
)

type PDVHandler struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewPDVHandler(pool *pgxpool.Pool) *PDVHandler {
	return &PDVHandler{
		pool:    pool,
		queries: db.New(pool),
	}
}

// DTOs
type OfflineVendaItemRequest struct {
	ProdutoGradeID string  `json:"produto_grade_id"`
	Quantidade     int     `json:"quantidade"`
	PrecoUnitario  float64 `json:"preco_unitario"`
}

type OfflineVendaRequest struct {
	OfflineUUID    string                    `json:"offline_uuid"`
	Total          float64                   `json:"total"`
	FormaPagamento string                    `json:"forma_pagamento"` // 'DINHEIRO', 'CARTAO_DEBITO', etc.
	ChaveNFe       string                    `json:"chave_nfe"`
	Itens          []OfflineVendaItemRequest `json:"itens"`
}

type AutorizarSupervisorRequest struct {
	Email string `json:"email"`
	Senha string `json:"senha"`
}

// 1. SyncCatalogoProdutos puxa dados de SKUs para salvar localmente no SQLite
func (h *PDVHandler) SyncCatalogoProdutos(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	ctx := context.Background()
	produtos, err := h.queries.ListProdutosGradeParaSync(ctx, pgtype.UUID{Bytes: tenantID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao carregar catálogo para sync"})
	}

	return c.JSON(produtos)
}

// 2. ProcessarFilaContingencia processa vendas offline em lote
func (h *PDVHandler) ProcessarFilaContingencia(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var fila []OfflineVendaRequest
	if err := c.BodyParser(&fila); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Lote inválido"})
	}

	ctx := context.Background()
	processadas := 0
	puladas := 0

	for _, req := range fila {
		offUUID, err := uuid.Parse(req.OfflineUUID)
		if err != nil {
			puladas++
			continue
		}

		// 1. Verifica duplicidade pelo offline_uuid
		vendaExiste, err := h.queries.GetVendaByOfflineUUID(ctx, pgtype.UUID{Bytes: offUUID, Valid: true})
		if err == nil && vendaExiste.ID.Valid {
			puladas++
			continue // Já sincronizado anteriormente
		}

		// Inicia Transação para gravação da venda, baixa do estoque local e financeiro
		tx, err := h.pool.Begin(ctx)
		if err != nil {
			puladas++
			continue
		}

		qtx := h.queries.WithTx(tx)

		// 2. Cria cabeçalho da Venda
		venda, err := qtx.CreateVenda(ctx, db.CreateVendaParams{
			EmpresaID:      pgtype.UUID{Bytes: tenantID, Valid: true},
			Total:          numeric(req.Total),
			Status:         "OFFLINE_SINCRONIZADA",
			FormaPagamento: strings.ToUpper(req.FormaPagamento),
			ChaveNfe:       pgtype.Text{String: req.ChaveNFe, Valid: req.ChaveNFe != ""},
			OfflineUuid:    pgtype.UUID{Bytes: offUUID, Valid: true},
		})
		if err != nil {
			tx.Rollback(ctx)
			puladas++
			continue
		}

		// 3. Cria itens e decrementa estoque
		falhaItem := false
		for _, item := range req.Itens {
			gradeID, _ := uuid.Parse(item.ProdutoGradeID)
			_, err = qtx.CreateVendaItem(ctx, db.CreateVendaItemParams{
				VendaID:        venda.ID,
				ProdutoGradeID: pgtype.UUID{Bytes: gradeID, Valid: true},
				Quantidade:     int32(item.Quantidade),
				PrecoUnitario:  numeric(item.PrecoUnitario),
			})
			if err != nil {
				falhaItem = true
				break
			}

			// Bloqueia a linha no banco de dados para evitar condições de corrida (Race Conditions)
			_, err = qtx.GetProdutoGradeParaUpdate(ctx, pgtype.UUID{Bytes: gradeID, Valid: true})
			if err != nil {
				falhaItem = true
				break
			}

			// Decrementa o estoque real no banco de dados do ERP
			_, err = qtx.DecrementEstoqueGrade(ctx, db.DecrementEstoqueGradeParams{
				ID:           pgtype.UUID{Bytes: gradeID, Valid: true},
				EstoqueAtual: int32(item.Quantidade),
			})
			if err != nil {
				falhaItem = true
				break
			}
		}

		if falhaItem {
			tx.Rollback(ctx)
			puladas++
			continue
		}

		// 4. Integração Automática Financeira: gera lançamento em contas a receber liquidados
		_, err = qtx.CreateContaReceber(ctx, db.CreateContaReceberParams{
			EmpresaID:      pgtype.UUID{Bytes: tenantID, Valid: true},
			Descricao:      "Venda PDV Caixa - UUID Offline " + req.OfflineUUID,
			Valor:          numeric(req.Total),
			DataVencimento: pgtype.Date{Time: time.Now(), Valid: true},
			Status:         "RECEBIDO",
			Origem:         "VENDA_PDV",
			OrigemID:       venda.ID,
		})
		if err != nil {
			tx.Rollback(ctx)
			puladas++
			continue
		}

		tx.Commit(ctx)
		processadas++
	}

	return c.JSON(fiber.Map{
		"mensagem":             "Sincronização concluída com sucesso!",
		"vendas_processadas": processadas,
		"vendas_duplicadas":  puladas,
	})
}

// 3. AutorizarSupervisor elevação de privilégios temporários no caixa
func (h *PDVHandler) AutorizarSupervisor(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var req AutorizarSupervisorRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	ctx := context.Background()
	user, err := h.queries.GetUsuarioByEmail(ctx, req.Email)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"erro": "Supervisor não encontrado"})
	}

	// Valida se o usuário pertence à mesma empresa contratante
	if uuid.UUID(user.EmpresaID.Bytes) != tenantID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"erro": "Acesso não autorizado"})
	}

	// Valida senha hash
	if err := bcrypt.CompareHashAndPassword([]byte(user.SenhaHash), []byte(req.Senha)); err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"erro": "Senha incorreta"})
	}

	// Valida cargo: deve ser GERENTE, SUPERVISOR ou master
	cargoUpper := strings.ToUpper(user.Cargo.String)
	if cargoUpper != "GERENTE" && cargoUpper != "SUPERVISOR" && !user.IsMaster.Bool {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"erro": "Alçada de acesso negada. Apenas Gerentes ou Supervisores podem autorizar esta ação.",
		})
	}

	return c.JSON(fiber.Map{
		"autorizado": true,
		"mensagem":   fmt.Sprintf("Ação autorizada com sucesso por %s (%s)!", user.Nome, user.Cargo.String),
	})
}

func numeric(val float64) pgtype.Numeric {
	num := pgtype.Numeric{}
	_ = num.Scan(fmt.Sprintf("%f", val))
	return num
}
