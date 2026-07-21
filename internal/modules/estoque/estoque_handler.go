package estoque

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

type EstoqueHandler struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewEstoqueHandler(pool *pgxpool.Pool) *EstoqueHandler {
	return &EstoqueHandler{
		pool:    pool,
		queries: db.New(pool),
	}
}

// DTOs
type SkuGradeRequest struct {
	Sku           string  `json:"sku"`
	Cor           string  `json:"cor"`
	Tamanho       string  `json:"tamanho"`
	CodigoBarras  string  `json:"codigo_barras"`
	EstoqueMinimo int     `json:"estoque_minimo"`
	PrecoVenda    float64 `json:"preco_venda"`
	PrecoCusto    float64 `json:"preco_custo"`
}

type CreateProdutoRequest struct {
	Nome      string            `json:"nome"`
	Descricao string            `json:"descricao"`
	SkuPai    string            `json:"sku_pai"`
	Grade     []SkuGradeRequest `json:"grade"`
}

type SolicitacaoItemRequest struct {
	ProdutoGradeID string `json:"produto_grade_id"`
	Quantidade     int    `json:"quantidade"`
}

type CreateSolicitacaoRequest struct {
	Observacoes string                   `json:"observacoes"`
	Itens       []SolicitacaoItemRequest `json:"itens"`
}

type PedidoItemRequest struct {
	ProdutoGradeID string  `json:"produto_grade_id"`
	Quantidade     int     `json:"quantidade"`
	PrecoCusto     float64 `json:"preco_custo"`
}

type CreatePedidoRequest struct {
	SolicitacaoCompraID string              `json:"solicitacao_compra_id"`
	FornecedorNome      string              `json:"fornecedor_nome"`
	Itens               []PedidoItemRequest `json:"itens"`
}

type EntradaItemRequest struct {
	ProdutoGradeID string  `json:"produto_grade_id"`
	Quantidade     int     `json:"quantidade"`
	PrecoCusto     float64 `json:"preco_custo"`
}

type CreateEntradaRequest struct {
	PedidoCompraID string               `json:"pedido_compra_id"`
	ChaveNFe       string               `json:"chave_nfe"`
	XmlNFe         string               `json:"xml_nfe"`
	Itens          []EntradaItemRequest `json:"itens"`
}

// DTOs Adicionais para Orçamentos/Cotações
type OrcamentoItemRequest struct {
	ProdutoGradeID string  `json:"produto_grade_id"`
	Quantidade     int     `json:"quantidade"`
	PrecoUnitario  float64 `json:"preco_unitario"`
}

type CreateOrcamentoRequest struct {
	FornecedorNome   string                 `json:"fornecedor_nome"`
	PrazoEntregaDias int                    `json:"prazo_entrega_dias"`
	Itens            []OrcamentoItemRequest `json:"itens"`
}

// 1. CreateProduto cadastrar produto e grade com estoque mínimo
func (h *EstoqueHandler) CreateProduto(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var req CreateProdutoRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	if req.Nome == "" || req.SkuPai == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Nome e SKU Pai são obrigatórios"})
	}

	ctx := context.Background()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Transação falhou"})
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)

	// Cria o Produto Pai
	produto, err := qtx.CreateProduto(ctx, db.CreateProdutoParams{
		EmpresaID: pgtype.UUID{Bytes: tenantID, Valid: true},
		Nome:      req.Nome,
		Descricao: pgtype.Text{String: req.Descricao, Valid: req.Descricao != ""},
		SkuPai:    req.SkuPai,
	})
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"erro": "Erro ao criar produto (SKU Pai já existe)"})
	}

	// Cria os SKUs de Grade
	var gradeCriada []db.ProdutosGrade
	for _, item := range req.Grade {
		skuItem, err := qtx.CreateProdutoGrade(ctx, db.CreateProdutoGradeParams{
			ProdutoID:     produto.ID,
			Sku:           item.Sku,
			Cor:           pgtype.Text{String: item.Cor, Valid: item.Cor != ""},
			Tamanho:       pgtype.Text{String: item.Tamanho, Valid: item.Tamanho != ""},
			CodigoBarras:  pgtype.Text{String: item.CodigoBarras, Valid: item.CodigoBarras != ""},
			EstoqueAtual:  0,
			EstoqueMinimo: int32(item.EstoqueMinimo),
			PrecoVenda:    numeric(item.PrecoVenda),
			PrecoCusto:    numeric(item.PrecoCusto),
		})
		if err != nil {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{"erro": "Erro ao criar SKU da grade: " + item.Sku})
		}
		gradeCriada = append(gradeCriada, skuItem)
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Falha ao gravar produto"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"mensagem": "Produto e SKUs cadastrados com sucesso!",
		"produto":  produto,
		"grade":    gradeCriada,
	})
}

// 2. CreateSolicitacao de compra (SC)
func (h *EstoqueHandler) CreateSolicitacao(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)
	userIDStr := c.Locals("user_id").(string)
	userID, _ := uuid.Parse(userIDStr)

	var req CreateSolicitacaoRequest
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

	sc, err := qtx.CreateSolicitacaoCompra(ctx, db.CreateSolicitacaoCompraParams{
		EmpresaID:   pgtype.UUID{Bytes: tenantID, Valid: true},
		UsuarioID:   pgtype.UUID{Bytes: userID, Valid: true},
		Status:      "PENDENTE",
		Observacoes: pgtype.Text{String: req.Observacoes, Valid: req.Observacoes != ""},
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao criar SC"})
	}

	for _, item := range req.Itens {
		gradeID, _ := uuid.Parse(item.ProdutoGradeID)
		_, err = qtx.CreateSolicitacaoCompraItem(ctx, db.CreateSolicitacaoCompraItemParams{
			SolicitacaoCompraID: sc.ID,
			ProdutoGradeID:      pgtype.UUID{Bytes: gradeID, Valid: true},
			Quantidade:          int32(item.Quantidade),
		})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao adicionar item à SC"})
		}
	}

	tx.Commit(ctx)
	return c.Status(fiber.StatusCreated).JSON(sc)
}

// 2.5 CreatePedido de compra (PC) manual com aprovação pendente
func (h *EstoqueHandler) CreatePedido(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var req CreatePedidoRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	if req.FornecedorNome == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Fornecedor é obrigatório"})
	}

	ctx := context.Background()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Transação falhou"})
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)

	var scID pgtype.UUID
	if req.SolicitacaoCompraID != "" {
		parsedSC, _ := uuid.Parse(req.SolicitacaoCompraID)
		scID = pgtype.UUID{Bytes: parsedSC, Valid: true}
	}

	// Calcula total do pedido
	var total float64
	for _, item := range req.Itens {
		total += float64(item.Quantidade) * item.PrecoCusto
	}

	// Cria o PC manual
	pc, err := qtx.CreatePedidoCompra(ctx, db.CreatePedidoCompraParams{
		EmpresaID:           pgtype.UUID{Bytes: tenantID, Valid: true},
		SolicitacaoCompraID: scID,
		FornecedorNome:      req.FornecedorNome,
		Status:              "PENDENTE_APROVACAO", // Iniciado como pendente para aprovação
		Total:               numeric(total),
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao criar PC"})
	}

	for _, item := range req.Itens {
		gradeID, _ := uuid.Parse(item.ProdutoGradeID)
		_, err = qtx.CreatePedidoCompraItem(ctx, db.CreatePedidoCompraItemParams{
			PedidoCompraID: pc.ID,
			ProdutoGradeID: pgtype.UUID{Bytes: gradeID, Valid: true},
			Quantidade:     int32(item.Quantidade),
			PrecoCusto:     numeric(item.PrecoCusto),
		})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao adicionar item ao PC"})
		}
	}

	// Se veio de uma SC, atualiza o status dela para APROVADA
	if scID.Valid {
		_, _ = qtx.UpdateSolicitacaoCompraStatus(ctx, db.UpdateSolicitacaoCompraStatusParams{
			ID:     scID,
			Status: "APROVADA",
		})
	}

	tx.Commit(ctx)
	return c.Status(fiber.StatusCreated).JSON(pc)
}

// 3. CreateOrcamento adiciona cotação/orçamento para uma Solicitação de Compra
func (h *EstoqueHandler) CreateOrcamento(c *fiber.Ctx) error {
	scIDStr := c.Params("id")
	scID, err := uuid.Parse(scIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID da SC inválido"})
	}

	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var req CreateOrcamentoRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	if req.FornecedorNome == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Nome do fornecedor é obrigatório"})
	}

	ctx := context.Background()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao iniciar transação"})
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)

	// Valida se a SC existe
	sc, err := qtx.GetSolicitacaoCompra(ctx, pgtype.UUID{Bytes: scID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"erro": "Solicitação de Compra não encontrada"})
	}
	if uuid.UUID(sc.EmpresaID.Bytes) != tenantID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"erro": "Acesso negado"})
	}

	// Calcula total
	var total float64
	for _, item := range req.Itens {
		total += float64(item.Quantidade) * item.PrecoUnitario
	}

	orcamento, err := qtx.CreateOrcamentoFornecedor(ctx, db.CreateOrcamentoFornecedorParams{
		EmpresaID:           pgtype.UUID{Bytes: tenantID, Valid: true},
		SolicitacaoCompraID: pgtype.UUID{Bytes: scID, Valid: true},
		FornecedorNome:      req.FornecedorNome,
		ValorTotal:          numeric(total),
		PrazoEntregaDias:    int32(req.PrazoEntregaDias),
		Escolhido:           pgtype.Bool{Bool: false, Valid: true},
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao salvar orçamento"})
	}

	for _, item := range req.Itens {
		gradeID, _ := uuid.Parse(item.ProdutoGradeID)
		_, err = qtx.CreateOrcamentoFornecedorItem(ctx, db.CreateOrcamentoFornecedorItemParams{
			OrcamentoFornecedorID: orcamento.ID,
			ProdutoGradeID:        pgtype.UUID{Bytes: gradeID, Valid: true},
			Quantidade:            int32(item.Quantidade),
			PrecoUnitario:         numeric(item.PrecoUnitario),
		})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao adicionar item ao orçamento"})
		}
	}

	tx.Commit(ctx)
	return c.Status(fiber.StatusCreated).JSON(orcamento)
}

// 4. EscolherOrcamento escolhe a cotação vencedora e gera o Pedido de Compra (PC) automaticamente
func (h *EstoqueHandler) EscolherOrcamento(c *fiber.Ctx) error {
	orcIDStr := c.Params("id")
	orcID, err := uuid.Parse(orcIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID do orçamento inválido"})
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

	// Busca orçamento
	orc, err := qtx.GetOrcamentoFornecedor(ctx, pgtype.UUID{Bytes: orcID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"erro": "Orçamento não encontrado"})
	}
	if uuid.UUID(orc.EmpresaID.Bytes) != tenantID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"erro": "Acesso negado"})
	}

	// Marca como escolhido
	_, err = qtx.MarkOrcamentoComoEscolhido(ctx, orc.ID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao escolher orçamento"})
	}

	// Atualiza SC para APROVADA
	_, _ = qtx.UpdateSolicitacaoCompraStatus(ctx, db.UpdateSolicitacaoCompraStatusParams{
		ID:     orc.SolicitacaoCompraID,
		Status: "APROVADA",
	})

	// Busca itens do orçamento
	itens, err := qtx.GetOrcamentoFornecedorItens(ctx, orc.ID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao buscar itens do orçamento"})
	}

	// Cria Pedido de Compra (PC) associado com status PENDENTE_APROVACAO
	pc, err := qtx.CreatePedidoCompra(ctx, db.CreatePedidoCompraParams{
		EmpresaID:           pgtype.UUID{Bytes: tenantID, Valid: true},
		SolicitacaoCompraID: orc.SolicitacaoCompraID,
		FornecedorNome:      orc.FornecedorNome,
		Status:              "PENDENTE_APROVACAO",
		Total:               orc.ValorTotal,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao criar PC automático"})
	}

	// Copia itens
	for _, item := range itens {
		_, err = qtx.CreatePedidoCompraItem(ctx, db.CreatePedidoCompraItemParams{
			PedidoCompraID: pc.ID,
			ProdutoGradeID: item.ProdutoGradeID,
			Quantidade:     item.Quantidade,
			PrecoCusto:     item.PrecoUnitario,
		})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao copiar itens para o PC"})
		}
	}

	tx.Commit(ctx)
	return c.JSON(fiber.Map{
		"mensagem": "Orçamento escolhido! Pedido de Compra gerado com sucesso.",
		"pedido":   pc,
	})
}

// 5. AprovarPedido executa fluxo de aprovação com limites (Alçadas)
func (h *EstoqueHandler) AprovarPedido(c *fiber.Ctx) error {
	pcIDStr := c.Params("id")
	pcID, err := uuid.Parse(pcIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID do PC inválido"})
	}

	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	isMasterLoc := c.Locals("is_master")
	isMaster := false
	if isMasterLoc != nil {
		isMaster = isMasterLoc.(bool)
	}

	ctx := context.Background()
	pc, err := h.queries.GetPedidoCompra(ctx, pgtype.UUID{Bytes: pcID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"erro": "Pedido de compra não encontrado"})
	}

	if uuid.UUID(pc.EmpresaID.Bytes) != tenantID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"erro": "Acesso negado"})
	}

	if pc.Status != "PENDENTE_APROVACAO" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Pedido já processado ou com status diferente de pendente"})
	}

	totalFloat, _ := pc.Total.Float64Value()

	// REGRA DE ALÇADA: se for maior que R$ 5.000,00 precisa ser Master
	if totalFloat.Float64 > 5000.00 && !isMaster {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"erro": "Alçada insuficiente. Pedidos acima de R$ 5.000,00 requerem aprovação de usuário Master.",
		})
	}

	// Atualiza status para APROVADO
	pedidoAprovado, err := h.queries.UpdatePedidoCompraStatus(ctx, db.UpdatePedidoCompraStatusParams{
		ID:     pc.ID,
		Status: "APROVADO",
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao atualizar status do pedido"})
	}

	return c.JSON(fiber.Map{
		"mensagem": "Pedido de compra aprovado com sucesso!",
		"pedido":   pedidoAprovado,
	})
}

// 6. ProcessEntrada de estoque (valida se o PC está APROVADO antes da entrada)
func (h *EstoqueHandler) ProcessEntrada(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var req CreateEntradaRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	ctx := context.Background()

	var pcID pgtype.UUID
	if req.PedidoCompraID != "" {
		parsedPC, _ := uuid.Parse(req.PedidoCompraID)
		pcID = pgtype.UUID{Bytes: parsedPC, Valid: true}

		// VALIDAÇÃO: o PC vinculado deve estar APROVADO
		pc, err := h.queries.GetPedidoCompra(ctx, pcID)
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"erro": "Pedido de compra não encontrado"})
		}
		if pc.Status != "APROVADO" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"erro": "Entrada de estoque recusada. O pedido de compra correspondente deve estar APROVADO.",
			})
		}
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Transação falhou"})
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)

	entrada, err := qtx.CreateEntradaEstoque(ctx, db.CreateEntradaEstoqueParams{
		EmpresaID:      pgtype.UUID{Bytes: tenantID, Valid: true},
		PedidoCompraID: pcID,
		ChaveNfe:       pgtype.Text{String: req.ChaveNFe, Valid: req.ChaveNFe != ""},
		XmlNfe:         pgtype.Text{String: req.XmlNFe, Valid: req.XmlNFe != ""},
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao registrar entrada"})
	}

	var totalEntrada float64

	for _, item := range req.Itens {
		gradeID, _ := uuid.Parse(item.ProdutoGradeID)
		totalEntrada += float64(item.Quantidade) * item.PrecoCusto

		// 1. Adiciona o item na tabela entradas_estoque_itens
		_, err = qtx.CreateEntradaEstoqueItem(ctx, db.CreateEntradaEstoqueItemParams{
			EntradaEstoqueID: entrada.ID,
			ProdutoGradeID:   pgtype.UUID{Bytes: gradeID, Valid: true},
			Quantidade:       int32(item.Quantidade),
			PrecoCusto:       numeric(item.PrecoCusto),
		})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao inserir item na entrada"})
		}

		// 2. Incrementa o estoque do SKU Filho e atualiza preço de custo
		_, err = qtx.IncrementEstoqueGrade(ctx, db.IncrementEstoqueGradeParams{
			ID:            pgtype.UUID{Bytes: gradeID, Valid: true},
			EstoqueAtual:  int32(item.Quantidade),
			PrecoCusto:    numeric(item.PrecoCusto),
		})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao atualizar estoque do SKU"})
		}
	}

	// 3. Atualiza o status do pedido para FATURADO se aplicável
	if pcID.Valid {
		_, _ = qtx.UpdatePedidoCompraStatus(ctx, db.UpdatePedidoCompraStatusParams{
			ID:     pcID,
			Status: "FATURADO",
		})
	}

	// 4. Integração Automática Financeira: gera lançamento em contas a pagar
	_, err = qtx.CreateContaPagar(ctx, db.CreateContaPagarParams{
		EmpresaID:      pgtype.UUID{Bytes: tenantID, Valid: true},
		Descricao:      "Entrada de Estoque - NFe " + req.ChaveNFe,
		Valor:          numeric(totalEntrada),
		DataVencimento: pgtype.Date{Time: time.Now().AddDate(0, 0, 30), Valid: true}, // 30 dias para pagar
		Status:         "PENDENTE",
		Origem:         "COMPRAS",
		OrigemID:       entrada.ID,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao criar lançamento financeiro"})
	}

	tx.Commit(ctx)
	return c.Status(fiber.StatusCreated).JSON(entrada)
}

// 7. ListAlertasEstoque lista produtos que atingiram ou estão abaixo do estoque mínimo
func (h *EstoqueHandler) ListAlertasEstoque(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	ctx := context.Background()
	alertas, err := h.queries.ListProdutosAbaixoEstoqueMinimo(ctx, pgtype.UUID{Bytes: tenantID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao buscar alertas de estoque"})
	}

	return c.JSON(alertas)
}

// 8. ObterSugestoesCompra calcula reposição de SKUs com estoque crítico
func (h *EstoqueHandler) ObterSugestoesCompra(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	ctx := context.Background()
	produtos, err := h.queries.ListProdutosGradeParaSync(ctx, pgtype.UUID{Bytes: tenantID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao carregar SKUs"})
	}

	type SugestaoCompra struct {
		ProdutoGradeID string  `json:"produto_grade_id"`
		Sku            string  `json:"sku"`
		Nome           string  `json:"nome"`
		EstoqueAtual   int     `json:"estoque_atual"`
		EstoqueMinimo  int     `json:"estoque_minimo"`
		SugeridoCompra int     `json:"sugerido_compra"`
		PrecoCusto     float64 `json:"preco_custo"`
		PrevisaoGasto  float64 `json:"previsao_gasto"`
	}

	var sugestoes []SugestaoCompra
	for _, p := range produtos {
		if p.EstoqueAtual < p.EstoqueMinimo {
			sugerido := int(p.EstoqueMinimo - p.EstoqueAtual)
			custo, _ := p.PrecoCusto.Float64Value()
			sugestoes = append(sugestoes, SugestaoCompra{
				ProdutoGradeID: uuid.UUID(p.ProdutoGradeID.Bytes).String(),
				Sku:            p.Sku,
				Nome:           p.ProdutoNome,
				EstoqueAtual:   int(p.EstoqueAtual),
				EstoqueMinimo:  int(p.EstoqueMinimo),
				SugeridoCompra: sugerido,
				PrecoCusto:     custo.Float64,
				PrevisaoGasto:  float64(sugerido) * custo.Float64,
			})
		}
	}

	return c.JSON(sugestoes)
}

// Helper para pgtype
func numeric(val float64) pgtype.Numeric {
	num := pgtype.Numeric{}
	_ = num.Scan(fmt.Sprintf("%f", val))
	return num
}
