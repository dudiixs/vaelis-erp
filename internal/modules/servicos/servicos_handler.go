package servicos

import (
	"context"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"erp/internal/platform/database/db"
)

type ServicosHandler struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewServicosHandler(pool *pgxpool.Pool) *ServicosHandler {
	return &ServicosHandler{
		pool:    pool,
		queries: db.New(pool),
	}
}

// DTOs
type CreateOSPecaRequest struct {
	ProdutoGradeID string  `json:"produto_grade_id"`
	Quantidade     int     `json:"quantidade"`
	PrecoUnitario  float64 `json:"preco_unitario"`
}

type CreateOSServicoRequest struct {
	Descricao     string  `json:"descricao"`
	PrecoUnitario float64 `json:"preco_unitario"`
	Quantidade    int     `json:"quantidade"`
}

type CreateOSRequest struct {
	ClienteNome        string                   `json:"cliente_nome"`
	VeiculoEquipamento string                   `json:"veiculo_equipamento"`
	Pecas              []CreateOSPecaRequest    `json:"pecas"`
	Servicos           []CreateOSServicoRequest `json:"servicos"`
}

type FaturarOSRequest struct {
	TecnicoNome string `json:"tecnico_nome"`
}

// 1. CreateOS registra uma Ordem de Serviço com peças e serviços
func (h *ServicosHandler) CreateOS(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var req CreateOSRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	if req.ClienteNome == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Nome do cliente é obrigatório"})
	}

	ctx := context.Background()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Transação falhou"})
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)

	var totalPecas, totalMaoObra float64

	for _, p := range req.Pecas {
		totalPecas += float64(p.Quantidade) * p.PrecoUnitario
	}
	for _, s := range req.Servicos {
		totalMaoObra += float64(s.Quantidade) * s.PrecoUnitario
	}
	totalGeral := totalPecas + totalMaoObra

	os, err := qtx.CreateOrdemServico(ctx, db.CreateOrdemServicoParams{
		EmpresaID:          pgtype.UUID{Bytes: tenantID, Valid: true},
		ClienteNome:        req.ClienteNome,
		VeiculoEquipamento: pgtype.Text{String: req.VeiculoEquipamento, Valid: req.VeiculoEquipamento != ""},
		Status:             "ABERTA",
		TotalPecas:         numeric(totalPecas),
		TotalMaoObra:       numeric(totalMaoObra),
		TotalGeral:         numeric(totalGeral),
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao criar Ordem de Serviço"})
	}

	for _, p := range req.Pecas {
		gradeID, _ := uuid.Parse(p.ProdutoGradeID)
		_, err = qtx.CreateOSPeca(ctx, db.CreateOSPecaParams{
			OsID:           os.ID,
			ProdutoGradeID: pgtype.UUID{Bytes: gradeID, Valid: true},
			Quantidade:     int32(p.Quantidade),
			PrecoUnitario:  numeric(p.PrecoUnitario),
		})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao adicionar peças"})
		}
	}

	for _, s := range req.Servicos {
		_, err = qtx.CreateOSServico(ctx, db.CreateOSServicoParams{
			OsID:          os.ID,
			Descricao:     s.Descricao,
			PrecoUnitario: numeric(s.PrecoUnitario),
			Quantidade:    int32(s.Quantidade),
		})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao adicionar mão de obra"})
		}
	}

	tx.Commit(ctx)
	return c.Status(fiber.StatusCreated).JSON(os)
}

// 2. GetOS detalha OS, peças e serviços contratados
func (h *ServicosHandler) GetOS(c *fiber.Ctx) error {
	osIDStr := c.Params("id")
	osID, err := uuid.Parse(osIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID inválido"})
	}

	ctx := context.Background()
	os, err := h.queries.GetOrdemServico(ctx, pgtype.UUID{Bytes: osID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"erro": "Ordem de Serviço não encontrada"})
	}

	pecas, err := h.queries.GetOSPecas(ctx, os.ID)
	if err != nil {
		pecas = []db.GetOSPecasRow{}
	}

	servicos, err := h.queries.GetOSServicos(ctx, os.ID)
	if err != nil {
		servicos = []db.OsServico{}
	}

	return c.JSON(fiber.Map{
		"ordem_servico": os,
		"pecas":         pecas,
		"servicos":      servicos,
	})
}

// 3. ListOS lista todas as Ordens de Serviço da empresa
func (h *ServicosHandler) ListOS(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	ctx := context.Background()
	list, err := h.queries.ListOrdensServico(ctx, pgtype.UUID{Bytes: tenantID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao carregar Ordens de Serviço"})
	}

	return c.JSON(list)
}

// 4. FaturarOS fecha a OS, decrementa estoque de peças e cria Contas a Receber (vence hoje) para recebimento no caixa
func (h *ServicosHandler) FaturarOS(c *fiber.Ctx) error {
	osIDStr := c.Params("id")
	osID, err := uuid.Parse(osIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID inválido"})
	}

	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	ctx := context.Background()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Transação falhou"})
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)

	// Busca OS
	os, err := qtx.GetOrdemServico(ctx, pgtype.UUID{Bytes: osID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"erro": "Ordem de Serviço não encontrada"})
	}

	if os.Status == "PAGA" || os.Status == "CONCLUIDA" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Ordem de Serviço já faturada anteriormente"})
	}

	pecas, err := qtx.GetOSPecas(ctx, os.ID)
	if err != nil {
		pecas = []db.GetOSPecasRow{}
	}

	// 1. Baixa o estoque físico das peças utilizadas na OS
	for _, p := range pecas {
		// Bloqueia a linha no banco de dados para evitar condições de corrida (Race Conditions)
		_, err = qtx.GetProdutoGradeParaUpdate(ctx, p.ProdutoGradeID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao travar estoque da peça: " + p.Sku})
		}

		_, err = qtx.DecrementEstoqueGrade(ctx, db.DecrementEstoqueGradeParams{
			ID:           p.ProdutoGradeID,
			EstoqueAtual: p.Quantidade,
		})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao atualizar estoque da peça: " + p.Sku})
		}
	}

	// 2. Cria lançamento financeiro no Contas a Receber (vence hoje)
	_, err = qtx.CreateContaReceber(ctx, db.CreateContaReceberParams{
		EmpresaID:      pgtype.UUID{Bytes: tenantID, Valid: true},
		Descricao:      "Faturamento OS - Cliente: " + os.ClienteNome,
		Valor:          os.TotalGeral,
		DataVencimento: pgtype.Date{Time: time.Now(), Valid: true},
		Status:         "PENDENTE", // Será liquidado quando pagar no caixa
		Origem:         "OS_FATURADA",
		OrigemID:       os.ID,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao criar contas a receber correspondente"})
	}

	// Parse body para pegar o nome do técnico se fornecido
	var reqFaturar FaturarOSRequest
	_ = c.BodyParser(&reqFaturar)

	// 2.5 Se informado técnico, gera comissão a pagar de 10% sobre a mão de obra
	if reqFaturar.TecnicoNome != "" {
		maoObraFloat, _ := os.TotalMaoObra.Float64Value()
		valorComissao := maoObraFloat.Float64 * 0.10
		if valorComissao > 0 {
			_, err = qtx.CreateContaPagar(ctx, db.CreateContaPagarParams{
				EmpresaID:      pgtype.UUID{Bytes: tenantID, Valid: true},
				Descricao:      "Comissão OS - Técnico: " + reqFaturar.TecnicoNome,
				Valor:          numeric(valorComissao),
				DataVencimento: pgtype.Date{Time: time.Now(), Valid: true},
				Status:         "PENDENTE",
				Origem:         "COMISSÃO_OS",
				OrigemID:       os.ID,
			})
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao gerar contas a pagar de comissão do técnico"})
			}
		}
	}

	// 3. Atualiza status da OS para CONCLUIDA
	osAtualizada, err := qtx.UpdateOSStatus(ctx, db.UpdateOSStatusParams{
		ID:           os.ID,
		Status:       "CONCLUIDA",
		TotalPecas:   os.TotalPecas,
		TotalMaoObra: os.TotalMaoObra,
		TotalGeral:   os.TotalGeral,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao faturar Ordem de Serviço"})
	}

	tx.Commit(ctx)
	return c.JSON(fiber.Map{
		"mensagem":      "Ordem de serviço concluída e faturada! Financeiro integrado.",
		"ordem_servico": osAtualizada,
	})
}

func numeric(val float64) pgtype.Numeric {
	num := pgtype.Numeric{}
	_ = num.Scan(fmt.Sprintf("%f", val))
	return num
}
