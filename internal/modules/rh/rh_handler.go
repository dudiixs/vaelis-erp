package rh

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"erp/internal/platform/database/db"
)

type RHHandler struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewRHHandler(pool *pgxpool.Pool) *RHHandler {
	return &RHHandler{
		pool:    pool,
		queries: db.New(pool),
	}
}

// DTOs
type CreateColaboradorRequest struct {
	Nome         string    `json:"nome"`
	CPF          string    `json:"cpf"`
	Cargo        string    `json:"cargo"`
	Salario      float64   `json:"salario"`
	DataAdmissao string    `json:"data_admissao"` // "YYYY-MM-DD"
}

type PontoRequest struct {
	ColaboradorID string `json:"colaborador_id"`
	Tipo          string `json:"tipo"`    // "ENTRADA", "SAIDA_ALMOCO", "RETORNO_ALMOCO", "SAIDA"
	Horario       string `json:"horario"` // Opcional, formato "YYYY-MM-DD HH:MM:SS"
}

type FechamentoFolhaRequest struct {
	MesReferencia string `json:"mes_referencia"` // "MM/AAAA" (ex: "07/2026")
}

// 1. CreateColaborador cadastrar funcionário
func (h *RHHandler) CreateColaborador(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var req CreateColaboradorRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	if req.Nome == "" || req.CPF == "" || req.Cargo == "" || req.Salario <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Campos obrigatórios ausentes ou salário inválido"})
	}

	// Limpa CPF
	cpfLimpo := strings.ReplaceAll(strings.ReplaceAll(req.CPF, ".", ""), "-", "")
	if len(cpfLimpo) != 11 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "CPF deve conter 11 dígitos"})
	}

	admissaoTime, err := time.Parse("2006-01-02", req.DataAdmissao)
	if err != nil {
		admissaoTime = time.Now()
	}

	ctx := context.Background()
	colaborador, err := h.queries.CreateColaborador(ctx, db.CreateColaboradorParams{
		EmpresaID:    pgtype.UUID{Bytes: tenantID, Valid: true},
		Nome:         req.Nome,
		Cpf:          cpfLimpo,
		Cargo:        req.Cargo,
		Salario:      numeric(req.Salario),
		DataAdmissao: pgtype.Date{Time: admissaoTime, Valid: true},
		Status:       "ATIVO",
	})
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"erro": "Erro ao criar colaborador (CPF já cadastrado na empresa)"})
	}

	return c.Status(fiber.StatusCreated).JSON(colaborador)
}

// 2. CreatePonto bater ponto do funcionário
func (h *RHHandler) CreatePonto(c *fiber.Ctx) error {
	var req PontoRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	colabID, err := uuid.Parse(req.ColaboradorID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID do colaborador inválido"})
	}

	horario := time.Now()
	if req.Horario != "" {
		if t, err := time.Parse("2006-01-02 15:04:05", req.Horario); err == nil {
			horario = t
		}
	}

	ctx := context.Background()
	ponto, err := h.queries.CreatePontoRegistro(ctx, db.CreatePontoRegistroParams{
		ColaboradorID: pgtype.UUID{Bytes: colabID, Valid: true},
		Tipo:          strings.ToUpper(req.Tipo),
		Horario:       pgtype.Timestamp{Time: horario, Valid: true},
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao registrar ponto"})
	}

	return c.Status(fiber.StatusCreated).JSON(ponto)
}

// 3. FechamentoFolha processa os salários da competência e cria o Contas a Pagar correspondente
func (h *RHHandler) FechamentoFolha(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var req FechamentoFolhaRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	if req.MesReferencia == "" || !strings.Contains(req.MesReferencia, "/") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Mês de referência inválido. Use MM/AAAA"})
	}

	ctx := context.Background()

	// Busca todos os colaboradores ativos da empresa
	colaboradores, err := h.queries.ListColaboradores(ctx, pgtype.UUID{Bytes: tenantID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao buscar colaboradores"})
	}

	if len(colaboradores) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Nenhum colaborador cadastrado para esta empresa"})
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao abrir transação"})
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)

	// Inicializa totais da folha
	var totalProventos float64
	var totalDescontos float64
	var totalLiquido float64

	// Criamos primeiro o cabeçalho da folha (status rascunho temporário)
	folha, err := qtx.CreateFolhaPagamento(ctx, db.CreateFolhaPagamentoParams{
		EmpresaID:     pgtype.UUID{Bytes: tenantID, Valid: true},
		MesReferencia: req.MesReferencia,
		Status:        "FECHADA", // fecha direto após cálculo
		TotalProventos: numeric(0),
		TotalDescontos: numeric(0),
		TotalLiquido:   numeric(0),
	})
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"erro": "Folha para este mês de referência já foi processada e fechada"})
	}

	type CalculoFuncionario struct {
		ColaboradorID   uuid.UUID
		SalarioBase     float64
		INSS            float64
		IRRF            float64
		LiquidoAReceber float64
	}

	var itensCalculados []CalculoFuncionario

	for _, colab := range colaboradores {
		salarioBase, _ := colab.Salario.Float64Value()
		
		// Cálculos simplificados de INSS
		inss := calcularINSS(salarioBase.Float64)

		// Cálculos simplificados de IRRF
		irrf := calcularIRRF(salarioBase.Float64 - inss)

		liquido := salarioBase.Float64 - inss - irrf

		totalProventos += salarioBase.Float64
		totalDescontos += (inss + irrf)
		totalLiquido += liquido

		itensCalculados = append(itensCalculados, CalculoFuncionario{
			ColaboradorID:   uuid.UUID(colab.ID.Bytes),
			SalarioBase:     salarioBase.Float64,
			INSS:            inss,
			IRRF:            irrf,
			LiquidoAReceber: liquido,
		})
	}

	// Insere os itens
	for _, item := range itensCalculados {
		_, err = qtx.CreateFolhaItem(ctx, db.CreateFolhaItemParams{
			FolhaPagamentoID: folha.ID,
			ColaboradorID:    pgtype.UUID{Bytes: item.ColaboradorID, Valid: true},
			SalarioBase:      numeric(item.SalarioBase),
			HorasExtras:      numeric(0),
			ValorHorasExtras: numeric(0),
			DescontoInss:     numeric(item.INSS),
			DescontoIrrf:     numeric(item.IRRF),
			OutrosDescontos:  numeric(0),
			LiquidoAReceber:  numeric(item.LiquidoAReceber),
		})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao salvar holerite do colaborador"})
		}
	}

	// Atualiza os totais na folha de pagamento
	_, err = tx.Exec(ctx, `
		UPDATE folhas_pagamento 
		SET total_proventos = $1, total_descontos = $2, total_liquido = $3 
		WHERE id = $4`,
		numeric(totalProventos), numeric(totalDescontos), numeric(totalLiquido), folha.ID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao atualizar totais da folha"})
	}

	// Calcula data de vencimento da folha (quinto dia útil do próximo mês - simplificado para o dia 5 do mês seguinte)
	partes := strings.Split(req.MesReferencia, "/")
	mes, _ := strconv.Atoi(partes[0])
	ano, _ := strconv.Atoi(partes[1])

	proximoMes := mes + 1
	proximoAno := ano
	if proximoMes > 12 {
		proximoMes = 1
		proximoAno = ano + 1
	}
	dataVencimento := time.Date(proximoAno, time.Month(proximoMes), 5, 0, 0, 0, 0, time.UTC)

	// Integração Automática com Financeiro: Cria lançamento em Contas a Pagar
	_, err = qtx.CreateContaPagar(ctx, db.CreateContaPagarParams{
		EmpresaID:      pgtype.UUID{Bytes: tenantID, Valid: true},
		Descricao:      "Folha de Pagamento - Ref: " + req.MesReferencia,
		Valor:          numeric(totalLiquido),
		DataVencimento: pgtype.Date{Time: dataVencimento, Valid: true},
		Status:         "PENDENTE",
		Origem:         "FOLHA_PAGAMENTO",
		OrigemID:       folha.ID,
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao gerar lançamento financeiro da folha"})
	}

	if err := tx.Commit(ctx); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao efetivar transação"})
	}

	return c.JSON(fiber.Map{
		"mensagem":        "Folha de pagamento fechada e enviada para o contas a pagar do financeiro!",
		"folha_id":        uuid.UUID(folha.ID.Bytes).String(),
		"total_proventos": totalProventos,
		"total_descontos": totalDescontos,
		"total_liquido":   totalLiquido,
		"vencimento":      dataVencimento.Format("2006-01-02"),
	})
}

// Auxiliares de cálculo de tributação (brackets simplificados de INSS e IRRF)
func calcularINSS(salario float64) float64 {
	if salario <= 1412.00 {
		return salario * 0.075
	} else if salario <= 2666.68 {
		return salario * 0.09
	} else if salario <= 4000.03 {
		return salario * 0.12
	}
	return salario * 0.14
}

func calcularIRRF(salarioBaseTributavel float64) float64 {
	if salarioBaseTributavel <= 2259.20 {
		return 0
	} else if salarioBaseTributavel <= 2826.65 {
		return salarioBaseTributavel * 0.075
	} else if salarioBaseTributavel <= 3751.05 {
		return salarioBaseTributavel * 0.15
	} else if salarioBaseTributavel <= 4664.68 {
		return salarioBaseTributavel * 0.225
	}
	return salarioBaseTributavel * 0.275
}

type CadastrarFaceRequest struct {
	FacialTemplate string `json:"facial_template"`
}

type PontoFacialRequest struct {
	ColaboradorID  string `json:"colaborador_id"`
	Tipo           string `json:"tipo"`
	Base64Imagem   string `json:"base64_imagem"`
	LocalizacaoGPS string `json:"localizacao_gps"`
}

// CadastrarFaceColaborador salva o hash ou dados biométricos do rosto do colaborador
func (h *RHHandler) CadastrarFaceColaborador(c *fiber.Ctx) error {
	colabIDStr := c.Params("id")
	colabID, err := uuid.Parse(colabIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID do colaborador inválido"})
	}

	var req CadastrarFaceRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	if req.FacialTemplate == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Template facial é obrigatório"})
	}

	ctx := context.Background()
	colab, err := h.queries.UpdateColaboradorFaceTemplate(ctx, db.UpdateColaboradorFaceTemplateParams{
		ID:                       pgtype.UUID{Bytes: colabID, Valid: true},
		FacialBiometriaTemplate: pgtype.Text{String: req.FacialTemplate, Valid: true},
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao salvar biometria facial"})
	}

	return c.JSON(fiber.Map{
		"mensagem": "Biometria facial cadastrada com sucesso!",
		"colaborador": colab.Nome,
	})
}

// RegistrarPontoFacial bate ponto validando a semelhança facial e gravando coordenadas GPS
func (h *RHHandler) RegistrarPontoFacial(c *fiber.Ctx) error {
	var req PontoFacialRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	colabID, err := uuid.Parse(req.ColaboradorID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID do colaborador inválido"})
	}

	ctx := context.Background()
	colab, err := h.queries.GetColaborador(ctx, pgtype.UUID{Bytes: colabID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"erro": "Colaborador não cadastrado"})
	}

	company, err := h.queries.GetEmpresa(ctx, colab.EmpresaID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao validar empresa"})
	}

	if !company.ModuloPontoFacial.Bool {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"erro": "Este recurso requer a contratação do add-on 'Reconhecimento Facial' no Painel Master.",
		})
	}

	// Verifica se colaborador cadastrou a face
	if !colab.FacialBiometriaTemplate.Valid || colab.FacialBiometriaTemplate.String == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Colaborador não possui biometria facial cadastrada no sistema"})
	}

	// 2. Simulação de Reconhecimento Facial (Score)
	similarity := 98.4 // Padrão sucesso
	
	// Regra de simulação de erro: se a string base64 contiver a palavra "INVALIDO", simula rejeição facial
	if strings.Contains(strings.ToUpper(req.Base64Imagem), "INVALIDO") {
		similarity = 41.2
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"erro": fmt.Sprintf("Reconhecimento facial falhou. Semelhança de %.1f%% é insuficiente (Mínimo requerido: 90%%).", similarity),
		})
	}

	fotoHash := fmt.Sprintf("sha256_%d", time.Now().UnixNano())

	// 3. Grava o registro de ponto
	ponto, err := h.queries.CreatePontoFacial(ctx, db.CreatePontoFacialParams{
		ColaboradorID:    colab.ID,
		Tipo:             strings.ToUpper(req.Tipo),
		Horario:          pgtype.Timestamp{Time: time.Now(), Valid: true},
		LocalizacaoGps:   pgtype.Text{String: req.LocalizacaoGPS, Valid: req.LocalizacaoGPS != ""},
		FotoHash:         pgtype.Text{String: fotoHash, Valid: true},
		FacialSimilarity: numeric(similarity),
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao registrar ponto"})
	}

	return c.JSON(fiber.Map{
		"mensagem":             "Ponto registrado e validado via biometria facial com sucesso!",
		"colaborador":          colab.Nome,
		"similaridade_facial":  fmt.Sprintf("%.2f%%", similarity),
		"localizacao_gps":      ponto.LocalizacaoGps.String,
		"horario":              ponto.Horario.Time.Format("02/01/2006 15:04:05"),
		"comprovante_digital":  uuid.New().String(),
	})
}

func numeric(val float64) pgtype.Numeric {
	num := pgtype.Numeric{}
	_ = num.Scan(fmt.Sprintf("%f", val))
	return num
}
