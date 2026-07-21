package kds

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"erp/internal/platform/database/db"
)

type KDSHandler struct {
	pool      *pgxpool.Pool
	queries   *db.Queries
	clients   map[*websocket.Conn]bool
	clientsMu sync.Mutex
	broadcast chan []byte
}

func NewKDSHandler(pool *pgxpool.Pool) *KDSHandler {
	h := &KDSHandler{
		pool:      pool,
		queries:   db.New(pool),
		clients:   make(map[*websocket.Conn]bool),
		broadcast: make(chan []byte, 100),
	}
	go h.startBroadcastLoop()
	return h
}

func (h *KDSHandler) startBroadcastLoop() {
	for {
		msg := <-h.broadcast
		h.clientsMu.Lock()
		activeConns := make([]*websocket.Conn, 0, len(h.clients))
		for conn := range h.clients {
			activeConns = append(activeConns, conn)
		}
		h.clientsMu.Unlock()

		for _, conn := range activeConns {
			go func(c *websocket.Conn) {
				_ = c.WriteMessage(1, msg) // 1 = TextMessage
			}(conn)
		}
	}
}

// HandleWS processa conexões WebSocket KDS em tempo real
func (h *KDSHandler) HandleWS(c *websocket.Conn) {
	h.clientsMu.Lock()
	h.clients[c] = true
	h.clientsMu.Unlock()

	defer func() {
		h.clientsMu.Lock()
		delete(h.clients, c)
		h.clientsMu.Unlock()
		c.Close()
	}()

	for {
		_, _, err := c.ReadMessage()
		if err != nil {
			break
		}
	}
}

// DTOs
type CreateComandaRequest struct {
	NumeroMesaComanda string `json:"numero_mesa_comanda"`
}

type AddComandaItemRequest struct {
	ProdutoGradeID string  `json:"produto_grade_id"`
	Quantidade     int     `json:"quantidade"`
	PrecoUnitario  float64 `json:"preco_unitario"`
}

type UpdateItemKdsStatusRequest struct {
	StatusCozinha string `json:"status_cozinha"`
}

// 1. AbrirComanda abre mesa ou comandas físicas
func (h *KDSHandler) AbrirComanda(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var req CreateComandaRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	if req.NumeroMesaComanda == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Número da mesa ou comanda é obrigatório"})
	}

	ctx := context.Background()
	comanda, err := h.queries.CreateComanda(ctx, db.CreateComandaParams{
		EmpresaID:         pgtype.UUID{Bytes: tenantID, Valid: true},
		NumeroMesaComanda: req.NumeroMesaComanda,
		Total:             numeric(0),
		Status:            "ABERTA",
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao abrir comanda"})
	}

	return c.Status(fiber.StatusCreated).JSON(comanda)
}

// 2. AdicionarItensComanda insere itens de consumo na comanda e envia ao KDS de cozinha em tempo real
func (h *KDSHandler) AdicionarItensComanda(c *fiber.Ctx) error {
	comandaIDStr := c.Params("id")
	comandaID, err := uuid.Parse(comandaIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID da comanda inválido"})
	}

	var req []AddComandaItemRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	ctx := context.Background()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Transação falhou"})
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)

	comanda, err := qtx.GetComanda(ctx, pgtype.UUID{Bytes: comandaID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"erro": "Comanda não encontrada"})
	}

	comandaTotal, _ := comanda.Total.Float64Value()
	novoTotal := comandaTotal.Float64

	var itensAdicionados []db.ComandaIten
	for _, item := range req {
		gradeID, _ := uuid.Parse(item.ProdutoGradeID)
		comandaItem, err := qtx.CreateComandaItem(ctx, db.CreateComandaItemParams{
			ComandaID:      pgtype.UUID{Bytes: comandaID, Valid: true},
			ProdutoGradeID: pgtype.UUID{Bytes: gradeID, Valid: true},
			Quantidade:     int32(item.Quantidade),
			PrecoUnitario:  numeric(item.PrecoUnitario),
			StatusCozinha:  "PENDENTE",
		})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao adicionar item"})
		}
		novoTotal += float64(item.Quantidade) * item.PrecoUnitario
		itensAdicionados = append(itensAdicionados, comandaItem)
	}

	// Atualiza comanda total
	_, err = qtx.UpdateComandaTotal(ctx, db.UpdateComandaTotalParams{
		ID:    comanda.ID,
		Total: numeric(novoTotal),
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao atualizar total"})
	}

	tx.Commit(ctx)

	// Dispara notificação WebSocket KDS
	notif := fiber.Map{
		"evento":     "NOVO_PEDIDO_KDS",
		"comanda_id": comandaIDStr,
		"mesa":       comanda.NumeroMesaComanda,
		"itens":      itensAdicionados,
	}
	bytes, _ := json.Marshal(notif)
	h.broadcast <- bytes

	return c.JSON(fiber.Map{
		"mensagem":   "Itens de consumo adicionados com sucesso!",
		"comanda_id": comandaIDStr,
		"novo_total": novoTotal,
	})
}

// 3. ListItensKds retorna o queue pendente para a cozinha com SLA/Atrasos de 15 minutos
func (h *KDSHandler) ListItensKds(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	ctx := context.Background()
	itens, err := h.queries.ListItensKdsPendentes(ctx, pgtype.UUID{Bytes: tenantID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao obter itens do KDS"})
	}

	type KdsItemExibicao struct {
		ID                uuid.UUID `json:"id"`
		ComandaID         uuid.UUID `json:"comanda_id"`
		ProdutoGradeID    uuid.UUID `json:"produto_grade_id"`
		Quantidade        int32     `json:"quantidade"`
		PrecoUnitario     float64   `json:"preco_unitario"`
		StatusCozinha     string    `json:"status_cozinha"`
		CriadoEm          time.Time `json:"criado_em"`
		Sku               string    `json:"sku"`
		ProdutoNome       string    `json:"produto_nome"`
		NumeroMesaComanda string    `json:"numero_mesa_comanda"`
		Atrasado          bool      `json:"atrasado"`
	}

	exibicao := []KdsItemExibicao{}
	agora := time.Now()
	for _, item := range itens {
		criado := item.CriadoEm.Time
		atrasado := false
		if agora.Sub(criado) > 15*time.Minute {
			atrasado = true
		}
		preco, _ := item.PrecoUnitario.Float64Value()

		exibicao = append(exibicao, KdsItemExibicao{
			ID:                uuid.UUID(item.ID.Bytes),
			ComandaID:         uuid.UUID(item.ComandaID.Bytes),
			ProdutoGradeID:    uuid.UUID(item.ProdutoGradeID.Bytes),
			Quantidade:        item.Quantidade,
			PrecoUnitario:     preco.Float64,
			StatusCozinha:     item.StatusCozinha,
			CriadoEm:          criado,
			Sku:               item.Sku,
			ProdutoNome:       item.ProdutoNome,
			NumeroMesaComanda: item.NumeroMesaComanda,
			Atrasado:          atrasado,
		})
	}

	return c.JSON(exibicao)
}

// 4. UpdateKdsStatus muda status do preparo e notifica
func (h *KDSHandler) UpdateKdsStatus(c *fiber.Ctx) error {
	itemIDStr := c.Params("itemId")
	itemID, err := uuid.Parse(itemIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID do item inválido"})
	}

	var req UpdateItemKdsStatusRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	statusUpper := strings.ToUpper(req.StatusCozinha)
	if statusUpper != "PENDENTE" && statusUpper != "EM_PREPARO" && statusUpper != "PRONTO" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Status inválido"})
	}

	ctx := context.Background()
	item, err := h.queries.UpdateKdsStatusItem(ctx, db.UpdateKdsStatusItemParams{
		ID:            pgtype.UUID{Bytes: itemID, Valid: true},
		StatusCozinha: statusUpper,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao atualizar item do KDS"})
	}

	// Broadcast
	notif := fiber.Map{
		"evento":         "ATUALIZACAO_KDS",
		"item_id":        itemIDStr,
		"status_cozinha": statusUpper,
	}
	bytes, _ := json.Marshal(notif)
	h.broadcast <- bytes

	return c.JSON(item)
}

// 5. FecharComanda fecha a comanda enviando-a ao caixa
func (h *KDSHandler) FecharComanda(c *fiber.Ctx) error {
	comandaIDStr := c.Params("id")
	comandaID, err := uuid.Parse(comandaIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID da comanda inválido"})
	}

	ctx := context.Background()
	comanda, err := h.queries.UpdateComandaStatus(ctx, db.UpdateComandaStatusParams{
		ID:     pgtype.UUID{Bytes: comandaID, Valid: true},
		Status: "FECHADA",
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao fechar comanda"})
	}

	return c.JSON(comanda)
}

func numeric(val float64) pgtype.Numeric {
	num := pgtype.Numeric{}
	_ = num.Scan(fmt.Sprintf("%f", val))
	return num
}
