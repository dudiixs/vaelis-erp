package financeiro

import (
	"context"
	"fmt"
	"math/rand"
	"sort"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"erp/internal/platform/database/db"
)

type FinanceiroHandler struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewFinanceiroHandler(pool *pgxpool.Pool) *FinanceiroHandler {
	return &FinanceiroHandler{
		pool:    pool,
		queries: db.New(pool),
	}
}

// DTOs
type CreateLancamentoRequest struct {
	Descricao      string  `json:"descricao"`
	Valor          float64 `json:"valor"`
	DataVencimento string  `json:"data_vencimento"` // "YYYY-MM-DD"
}

type BankConfigRequest struct {
	BancoNome          string `json:"banco_nome"` // "ITAU", "BRADESCO", "SANTANDER", "BANCO_DO_BRASIL"
	ClientID           string `json:"client_id"`
	ClientSecret       string `json:"client_secret"`
	CertificadoDigital string `json:"certificado_digital"`
}

type CreateBorderopRequest struct {
	Descricao string `json:"descricao"`
}

type AddContasBorderopRequest struct {
	Contas []string `json:"contas"`
}

type TransmitirBorderopRequest struct {
	Banco string `json:"banco"` // "ITAU", "BRADESCO", etc.
}

type CreatePcoRequest struct {
	Categoria     string  `json:"categoria"`      // "RH", "COMPRAS", etc.
	MesReferencia string  `json:"mes_referencia"` // "MM/AAAA"
	LimiteOrcado  float64 `json:"limite_orcado"`
}

type CashFlowDay struct {
	Data           string  `json:"data"`
	Entradas       float64 `json:"entradas"`
	Saidas         float64 `json:"saidas"`
	SaldoDia       float64 `json:"saldo_dia"`
	SaldoAcumulado float64 `json:"saldo_acumulado"`
}

// Helper para PCO (Planejamento e Controle Orçamentário)
func (h *FinanceiroHandler) registrarNoPCO(ctx context.Context, empresaID uuid.UUID, categoria string, valor float64, dataRef time.Time) (string, error) {
	catUpper := strings.ToUpper(categoria)
	mesRef := dataRef.Format("02/2006") // MM/AAAA
	if len(mesRef) > 7 {
		mesRef = mesRef[3:]
	}

	orcamento, err := h.queries.GetPcoOrcamento(ctx, db.GetPcoOrcamentoParams{
		EmpresaID:     pgtype.UUID{Bytes: empresaID, Valid: true},
		Categoria:     catUpper,
		MesReferencia: mesRef,
	})
	if err != nil {
		// Se não há orçamento cadastrado para o mês, não valida
		return "", nil
	}

	// Incrementa
	realizado, err := h.queries.IncrementarRealizadoPCO(ctx, db.IncrementarRealizadoPCOParams{
		EmpresaID:      pgtype.UUID{Bytes: empresaID, Valid: true},
		Categoria:      catUpper,
		MesReferencia:  mesRef,
		ValorRealizado: numeric(valor),
	})
	if err != nil {
		return "", err
	}

	limiteVal, _ := orcamento.LimiteOrcado.Float64Value()
	realizadoVal, _ := realizado.ValorRealizado.Float64Value()

	if realizadoVal.Float64 > limiteVal.Float64 {
		return fmt.Sprintf("[ALERTA PCO] O orçamento mensal para a categoria %s foi excedido em %s. Limite Orçado: R$ %.2f | Valor Realizado acumulado: R$ %.2f", 
			catUpper, mesRef, limiteVal.Float64, realizadoVal.Float64), nil
	}

	return "", nil
}

// 1. CreateContaPagarManual cria conta a pagar manualmente e valida orçamento (PCO)
func (h *FinanceiroHandler) CreateContaPagarManual(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var req CreateLancamentoRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	vencimento, err := time.Parse("2006-01-02", req.DataVencimento)
	if err != nil {
		vencimento = time.Now().AddDate(0, 0, 30)
	}

	ctx := context.Background()
	conta, err := h.queries.CreateContaPagar(ctx, db.CreateContaPagarParams{
		EmpresaID:      pgtype.UUID{Bytes: tenantID, Valid: true},
		Descricao:      req.Descricao,
		Valor:          numeric(req.Valor),
		DataVencimento: pgtype.Date{Time: vencimento, Valid: true},
		Status:         "PENDENTE",
		Origem:         "AVULSO",
		OrigemID:       pgtype.UUID{Valid: false},
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao criar conta a pagar"})
	}

	// Registra e valida no PCO (usando categoria "AVULSO" para lançamentos manuais)
	alertaPCO, _ := h.registrarNoPCO(ctx, tenantID, "AVULSO", req.Valor, vencimento)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"conta":      conta,
		"alerta_pco": alertaPCO,
	})
}

// 2. CreateContaReceberManual cria conta a receber manualmente
func (h *FinanceiroHandler) CreateContaReceberManual(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var req CreateLancamentoRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	vencimento, err := time.Parse("2006-01-02", req.DataVencimento)
	if err != nil {
		vencimento = time.Now().AddDate(0, 0, 30)
	}

	ctx := context.Background()
	conta, err := h.queries.CreateContaReceber(ctx, db.CreateContaReceberParams{
		EmpresaID:      pgtype.UUID{Bytes: tenantID, Valid: true},
		Descricao:      req.Descricao,
		Valor:          numeric(req.Valor),
		DataVencimento: pgtype.Date{Time: vencimento, Valid: true},
		Status:         "PENDENTE",
		Origem:         "AVULSO",
		OrigemID:       pgtype.UUID{Valid: false},
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao criar conta a receber"})
	}

	return c.Status(fiber.StatusCreated).JSON(conta)
}

// 3. ListContasPagar lista todas as contas a pagar da empresa
func (h *FinanceiroHandler) ListContasPagar(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	ctx := context.Background()
	contas, err := h.queries.ListContasPagar(ctx, pgtype.UUID{Bytes: tenantID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao listar contas a pagar"})
	}

	return c.JSON(contas)
}

// 4. ListContasReceber lista todas as contas a receber da empresa
func (h *FinanceiroHandler) ListContasReceber(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	ctx := context.Background()
	contas, err := h.queries.ListContasReceber(ctx, pgtype.UUID{Bytes: tenantID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao listar contas a receber"})
	}

	return c.JSON(contas)
}

// 5. BaixarContaPagar realiza a baixa de um pagamento (PAGO) e registra data de liquidação
func (h *FinanceiroHandler) BaixarContaPagar(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID inválido"})
	}

	ctx := context.Background()
	conta, err := h.queries.UpdateContaPagarStatus(ctx, db.UpdateContaPagarStatusParams{
		ID:            pgtype.UUID{Bytes: id, Valid: true},
		Status:        "PAGO",
		DataPagamento: pgtype.Timestamp{Time: time.Now(), Valid: true},
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao liquidar conta a pagar"})
	}

	return c.JSON(conta)
}

// 6. BaixarContaReceber realiza a baixa de um recebimento (RECEBIDO)
func (h *FinanceiroHandler) BaixarContaReceber(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID inválido"})
	}

	ctx := context.Background()
	conta, err := h.queries.UpdateContaReceberStatus(ctx, db.UpdateContaReceberStatusParams{
		ID:            pgtype.UUID{Bytes: id, Valid: true},
		Status:        "RECEBIDO",
		DataPagamento: pgtype.Timestamp{Time: time.Now(), Valid: true},
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao liquidar conta a receber"})
	}

	return c.JSON(conta)
}

// --- INTEGRAÇÃO BANCÁRIA ---

// SaveBankConfig salva credenciais API de Itaú, Bradesco, etc (apenas Master)
func (h *FinanceiroHandler) SaveBankConfig(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	isMasterLoc := c.Locals("is_master")
	isMaster := false
	if isMasterLoc != nil {
		isMaster = isMasterLoc.(bool)
	}

	if !isMaster {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"erro": "Apenas o administrador Master pode alterar configurações de integrações de bancos."})
	}

	var req BankConfigRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	bancoUpper := strings.ToUpper(req.BancoNome)
	if bancoUpper != "ITAU" && bancoUpper != "BRADESCO" && bancoUpper != "SANTANDER" && bancoUpper != "BANCO_DO_BRASIL" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Banco suportado inválido. Suportados: ITAU, BRADESCO, SANTANDER, BANCO_DO_BRASIL"})
	}

	ctx := context.Background()
	config, err := h.queries.SaveBankConfig(ctx, db.SaveBankConfigParams{
		EmpresaID:          pgtype.UUID{Bytes: tenantID, Valid: true},
		BancoNome:          bancoUpper,
		ClientID:           req.ClientID,
		ClientSecret:       req.ClientSecret,
		CertificadoDigital: pgtype.Text{String: req.CertificadoDigital, Valid: req.CertificadoDigital != ""},
		Status:             "CONECTADO",
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao salvar configuração bancária"})
	}

	return c.JSON(fiber.Map{
		"mensagem":      fmt.Sprintf("Integração do banco %s salva com sucesso!", bancoUpper),
		"configuracao": config,
	})
}

// GetBankConfigs retorna integrações ativas
func (h *FinanceiroHandler) GetBankConfigs(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	ctx := context.Background()
	configs, err := h.queries.GetBankConfigs(ctx, pgtype.UUID{Bytes: tenantID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao obter integrações"})
	}

	return c.JSON(configs)
}

// --- FLUXO DE BORDERÔS ---

// CreateBorderop cria um lote de pagamento vazio
func (h *FinanceiroHandler) CreateBorderop(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var req CreateBorderopRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	if req.Descricao == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Descrição é obrigatória"})
	}

	ctx := context.Background()
	borderop, err := h.queries.CreateBorderop(ctx, db.CreateBorderopParams{
		EmpresaID: pgtype.UUID{Bytes: tenantID, Valid: true},
		Descricao: req.Descricao,
		Status:    "EM_DIGITACAO",
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao criar borderô"})
	}

	return c.Status(fiber.StatusCreated).JSON(borderop)
}

// VincularContasAoBorderop associa contas a pagar a um lote específico
func (h *FinanceiroHandler) VincularContasAoBorderop(c *fiber.Ctx) error {
	borderopIDStr := c.Params("id")
	borderopID, err := uuid.Parse(borderopIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID do borderô inválido"})
	}

	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var req AddContasBorderopRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	ctx := context.Background()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro de transação"})
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)

	// Valida se borderô existe
	borderop, err := qtx.GetBorderop(ctx, pgtype.UUID{Bytes: borderopID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"erro": "Borderô não encontrado"})
	}
	if borderop.Status != "EM_DIGITACAO" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Não é possível adicionar contas a um borderô já processado"})
	}

	for _, idStr := range req.Contas {
		contaID, _ := uuid.Parse(idStr)
		_, err = qtx.VincularContaAoBorderop(ctx, db.VincularContaAoBorderopParams{
			ID:          pgtype.UUID{Bytes: contaID, Valid: true},
			BorderopID:  pgtype.UUID{Bytes: borderopID, Valid: true},
			EmpresaID:   pgtype.UUID{Bytes: tenantID, Valid: true},
		})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao vincular conta: " + idStr})
		}
	}

	tx.Commit(ctx)
	return c.JSON(fiber.Map{"mensagem": "Contas associadas ao borderô com sucesso!"})
}

// TransmitirBorderop simula autenticação e envio de Pix/remessa bancária e liquida em lote
func (h *FinanceiroHandler) TransmitirBorderop(c *fiber.Ctx) error {
	borderopIDStr := c.Params("id")
	borderopID, err := uuid.Parse(borderopIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID do borderô inválido"})
	}

	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var req TransmitirBorderopRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	bancoUpper := strings.ToUpper(req.Banco)

	ctx := context.Background()

	// 1. Busca configurações bancárias ativas da empresa para este banco
	bancoConfig, err := h.queries.GetBankConfigByBanco(ctx, db.GetBankConfigByBancoParams{
		EmpresaID: pgtype.UUID{Bytes: tenantID, Valid: true},
		BancoNome: bancoUpper,
	})
	if err != nil {
		return c.Status(fiber.StatusFailedDependency).JSON(fiber.Map{
			"erro": fmt.Sprintf("A transmissão falhou. Nenhuma integração ativa configurada para o banco %s. O administrador Master precisa cadastrar os tokens API.", bancoUpper),
		})
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro de transação"})
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)

	// 2. Busca o borderô e as contas vinculadas
	borderop, err := qtx.GetBorderop(ctx, pgtype.UUID{Bytes: borderopID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"erro": "Borderô não encontrado"})
	}
	if borderop.Status != "EM_DIGITACAO" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Borderô já foi liquidado ou transmitido"})
	}

	contas, err := qtx.ListContasNoBorderop(ctx, pgtype.UUID{Bytes: borderopID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao listar títulos do borderô"})
	}

	if len(contas) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Borderô não possui títulos vinculados"})
	}

	var valorTotal float64
	for _, conta := range contas {
		v, _ := conta.Valor.Float64Value()
		valorTotal += v.Float64
	}

	// 3. Simulação de Chamada de API do Banco (Pix / TED Batch)
	fmt.Printf("[BANCO %s API] --- INICIANDO TRANSMISSÃO BANCÁRIA ---\n", bancoUpper)
	fmt.Printf("[BANCO %s API] Autenticando usando ClientID: %s e ClientSecret: %s...\n", bancoUpper, bancoConfig.ClientID, bancoConfig.ClientSecret[:4]+"***")
	fmt.Printf("[BANCO %s API] Certificado digital verificado com sucesso.\n", bancoUpper)
	fmt.Printf("[BANCO %s API] Transmitindo lote de %d pagamentos (TED/Pix no valor total de R$ %.2f).\n", bancoUpper, len(contas), valorTotal)
	txID := rand.Int31n(1000000)
	fmt.Printf("[BANCO %s API] Sucesso! Banco liquidou os lançamentos. ID de transação bancária: E2E-TX-%d\n", bancoUpper, txID)
	fmt.Printf("[BANCO %s API] --- TRANSMISSÃO CONCLUÍDA COM SUCESSO ---\n", bancoUpper)

	// 4. Baixa todas as contas do Borderô no DB
	_, err = qtx.BaixarContasDoBorderop(ctx, db.BaixarContasDoBorderopParams{
		BorderopID:    pgtype.UUID{Bytes: borderopID, Valid: true},
		DataPagamento: pgtype.Timestamp{Time: time.Now(), Valid: true},
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao baixar os títulos no banco de dados"})
	}

	// 5. Atualiza o status do borderô para PAGO
	_, err = qtx.UpdateBorderopStatus(ctx, db.UpdateBorderopStatusParams{
		ID:     pgtype.UUID{Bytes: borderopID, Valid: true},
		Status: "PAGO",
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao atualizar status do borderô"})
	}

	tx.Commit(ctx)
	return c.JSON(fiber.Map{
		"mensagem":        "Lote de borderô processado e liquidado com sucesso pelo banco!",
		"borderop_id":     borderopID,
		"valor_total":     valorTotal,
		"banco_utilizado": bancoUpper,
		"transacao_banco": fmt.Sprintf("E2E-TX-%d", txID),
	})
}

// --- PCO (Planejamento e Controle Orçamentário) ---

// CreatePcoLimit cadastra o limite mensal para uma categoria
func (h *FinanceiroHandler) CreatePcoLimit(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var req CreatePcoRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	if req.Categoria == "" || req.MesReferencia == "" || req.LimiteOrcado <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Categoria, mês de referência (MM/AAAA) e limite positivo são obrigatórios"})
	}

	ctx := context.Background()
	pco, err := h.queries.CreatePcoOrcamento(ctx, db.CreatePcoOrcamentoParams{
		EmpresaID:      pgtype.UUID{Bytes: tenantID, Valid: true},
		Categoria:      strings.ToUpper(req.Categoria),
		MesReferencia:  req.MesReferencia,
		LimiteOrcado:   numeric(req.LimiteOrcado),
		ValorRealizado: numeric(0),
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao criar limite orçamentário no PCO"})
	}

	return c.Status(fiber.StatusCreated).JSON(pco)
}

// GetPcoComparativo retorna o orçamento orçado vs realizado do mês
func (h *FinanceiroHandler) GetPcoComparativo(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)
	mes := c.Params("mes")
	ano := c.Params("ano")

	mesRef := fmt.Sprintf("%s/%s", mes, ano)

	ctx := context.Background()
	orcamentos, err := h.queries.ListPcoOrcamentos(ctx, db.ListPcoOrcamentosParams{
		EmpresaID:     pgtype.UUID{Bytes: tenantID, Valid: true},
		MesReferencia: mesRef,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao buscar dados do PCO"})
	}

	type PcoComparativoDTO struct {
		Categoria   string  `json:"categoria"`
		Mes         string  `json:"mes_referencia"`
		Orcado      float64 `json:"limite_orcado"`
		Realizado   float64 `json:"valor_realizado"`
		Percentual  float64 `json:"percentual_consumido"`
		Ultrapassou bool    `json:"ultrapassou_limite"`
	}

	var resultado []PcoComparativoDTO
	for _, o := range orcamentos {
		orcFloat, _ := o.LimiteOrcado.Float64Value()
		realFloat, _ := o.ValorRealizado.Float64Value()

		pct := 0.0
		if orcFloat.Float64 > 0 {
			pct = (realFloat.Float64 / orcFloat.Float64) * 100.0
		}

		resultado = append(resultado, PcoComparativoDTO{
			Categoria:   o.Categoria,
			Mes:         o.MesReferencia,
			Orcado:      orcFloat.Float64,
			Realizado:   realFloat.Float64,
			Percentual:  pct,
			Ultrapassou: realFloat.Float64 > orcFloat.Float64,
		})
	}

	return c.JSON(resultado)
}

// --- ANALÍTICO: FLUXO DE CAIXA ---

// GetFluxoCaixa consolida pagamentos e recebimentos diários e gera o saldo acumulado histórico
func (h *FinanceiroHandler) GetFluxoCaixa(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	ctx := context.Background()

	// Busca todas as contas a pagar e receber da empresa
	pagar, err := h.queries.ListContasPagar(ctx, pgtype.UUID{Bytes: tenantID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao ler dados"})
	}

	receber, err := h.queries.ListContasReceber(ctx, pgtype.UUID{Bytes: tenantID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao ler dados"})
	}

	// Agrupamento diário
	mapDias := make(map[string]*CashFlowDay)

	for _, r := range receber {
		if r.Status == "RECEBIDO" {
			dataRef := r.DataVencimento.Time.Format("2006-01-02")
			val, _ := r.Valor.Float64Value()
			if _, ok := mapDias[dataRef]; !ok {
				mapDias[dataRef] = &CashFlowDay{Data: dataRef}
			}
			mapDias[dataRef].Entradas += val.Float64
		}
	}

	for _, p := range pagar {
		if p.Status == "PAGO" {
			dataRef := p.DataVencimento.Time.Format("2006-01-02")
			val, _ := p.Valor.Float64Value()
			if _, ok := mapDias[dataRef]; !ok {
				mapDias[dataRef] = &CashFlowDay{Data: dataRef}
			}
			mapDias[dataRef].Saidas += val.Float64
		}
	}

	// Ordena os dias cronologicamente
	var datas []string
	for k := range mapDias {
		datas = append(datas, k)
	}
	sort.Strings(datas)

	var fluxoFinal []CashFlowDay
	var saldoAcumulado float64

	for _, d := range datas {
		diaObj := mapDias[d]
		diaObj.SaldoDia = diaObj.Entradas - diaObj.Saidas
		saldoAcumulado += diaObj.SaldoDia
		diaObj.SaldoAcumulado = saldoAcumulado

		fluxoFinal = append(fluxoFinal, *diaObj)
	}

	return c.JSON(fluxoFinal)
}

// GetConsolidadoCategorias agrupa despesas e receitas por origem
func (h *FinanceiroHandler) GetConsolidadoCategorias(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	ctx := context.Background()

	// Buscar Contas a Pagar
	pagar, err := h.queries.ListContasPagar(ctx, pgtype.UUID{Bytes: tenantID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao buscar contas a pagar"})
	}

	// Buscar Contas a Receber
	receber, err := h.queries.ListContasReceber(ctx, pgtype.UUID{Bytes: tenantID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao buscar contas a receber"})
	}

	type CategoriaResumo struct {
		Origem     string  `json:"origem"`
		Total      float64 `json:"total"`
		Percentual float64 `json:"percentual"`
	}

	resumoDespesas := make(map[string]float64)
	resumoReceitas := make(map[string]float64)
	var totalDespesas, totalReceitas float64

	for _, item := range pagar {
		val, _ := item.Valor.Float64Value()
		resumoDespesas[item.Origem] += val.Float64
		totalDespesas += val.Float64
	}

	for _, item := range receber {
		val, _ := item.Valor.Float64Value()
		resumoReceitas[item.Origem] += val.Float64
		totalReceitas += val.Float64
	}

	despesasLista := []CategoriaResumo{}
	for orig, val := range resumoDespesas {
		pct := 0.0
		if totalDespesas > 0 {
			pct = (val / totalDespesas) * 100
		}
		despesasLista = append(despesasLista, CategoriaResumo{
			Origem:     orig,
			Total:      val,
			Percentual: pct,
		})
	}

	receitasLista := []CategoriaResumo{}
	for orig, val := range resumoReceitas {
		pct := 0.0
		if totalReceitas > 0 {
			pct = (val / totalReceitas) * 100
		}
		receitasLista = append(receitasLista, CategoriaResumo{
			Origem:     orig,
			Total:      val,
			Percentual: pct,
		})
	}

	return c.JSON(fiber.Map{
		"total_despesas":   totalDespesas,
		"total_receitas":   totalReceitas,
		"saldo_liquido":    totalReceitas - totalDespesas,
		"detalhe_despesas": despesasLista,
		"detalhe_receitas": receitasLista,
	})
}

func numeric(val float64) pgtype.Numeric {
	num := pgtype.Numeric{}
	_ = num.Scan(fmt.Sprintf("%f", val))
	return num
}
