package fiscal

import (
	"context"
	"fmt"
	"math/rand"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"erp/internal/platform/database/db"
)

type FiscalHandler struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewFiscalHandler(pool *pgxpool.Pool) *FiscalHandler {
	return &FiscalHandler{
		pool:    pool,
		queries: db.New(pool),
	}
}

// DTOs
type EmitirNotaRequest struct {
	Tipo       string  `json:"tipo"`        // "NFE" ou "NFCE"
	ValorTotal float64 `json:"valor_total"`
}

// 1. EmitirNota simula transmissão fiscal, gera a chave SEFAZ e salva XML mock
func (h *FiscalHandler) EmitirNota(c *fiber.Ctx) error {
	tenantIDStr := c.Locals("tenant_id").(string)
	tenantID, _ := uuid.Parse(tenantIDStr)

	var req EmitirNotaRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	if req.Tipo != "NFE" && req.Tipo != "NFCE" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Tipo de nota inválido. Use 'NFE' ou 'NFCE'"})
	}

	if req.ValorTotal <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Valor total deve ser maior que zero"})
	}

	ctx := context.Background()

	// 1. Obtém os detalhes da empresa para compor a chave (CNPJ)
	empresa, err := h.queries.GetEmpresa(ctx, pgtype.UUID{Bytes: tenantID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao obter dados da empresa"})
	}

	// 2. Busca número sequencial da nota
	maxNum, err := h.queries.GetMaxNotaFiscalNumero(ctx, db.GetMaxNotaFiscalNumeroParams{
		EmpresaID: pgtype.UUID{Bytes: tenantID, Valid: true},
		Tipo:      req.Tipo,
	})
	if err != nil {
		maxNum = 0
	}
	proximoNumero := maxNum + 1
	serie := 1

	// 3. Gera chave de acesso SEFAZ de 44 dígitos
	chaveAcesso := gerarChaveSEFAZ(empresa.Cnpj, req.Tipo, int(proximoNumero), serie)

	// 4. Cria XML representativo mock
	xmlMock := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe%s" versao="4.00">
      <ide>
        <cUF>35</cUF>
        <cNF>%08d</cNF>
        <mod>%s</mod>
        <serie>%d</serie>
        <nNF>%d</nNF>
        <dhEmi>%s</dhEmi>
        <tpEmis>1</tpEmis>
      </ide>
      <emit>
        <CNPJ>%s</CNPJ>
        <xNome>%s</xNome>
      </emit>
      <total>
        <ICMSTot>
          <vNF>%.2f</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <tpAmb>1</tpAmb>
      <verAplic>SP_NFe_PL_009_v4</verAplic>
      <chNFe>%s</chNFe>
      <dhRecbto>%s</dhRecbto>
      <nProt>%d</nProt>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso da NF-e</xMotivo>
    </infProt>
  </protNFe>
</nfeProc>`,
		chaveAcesso,
		rand.Int31n(99999999),
		mapTipoDocumento(req.Tipo),
		serie,
		proximoNumero,
		time.Now().Format(time.RFC3339),
		empresa.Cnpj,
		empresa.RazaoSocial,
		req.ValorTotal,
		chaveAcesso,
		time.Now().Format(time.RFC3339),
		rand.Int63n(999999999999999),
	)

	// 5. Salva no banco de dados
	nota, err := h.queries.CreateNotaFiscal(ctx, db.CreateNotaFiscalParams{
		EmpresaID:   pgtype.UUID{Bytes: tenantID, Valid: true},
		Tipo:        req.Tipo,
		ChaveAcesso: chaveAcesso,
		Numero:      int32(proximoNumero),
		Serie:       int32(serie),
		ValorTotal:  numeric(req.ValorTotal),
		XmlContent:  xmlMock,
		Status:      "AUTORIZADA",
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao salvar Nota Fiscal no banco"})
	}

	return c.Status(fiber.StatusCreated).JSON(nota)
}

// 2. GetNotaFiscal busca uma nota fiscal por chave
func (h *FiscalHandler) GetNotaFiscal(c *fiber.Ctx) error {
	chave := c.Params("chave")
	if len(chave) != 44 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Chave de acesso deve conter 44 caracteres"})
	}

	ctx := context.Background()
	nota, err := h.queries.GetNotaFiscalByChave(ctx, chave)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"erro": "Nota fiscal não encontrada"})
	}

	tenantIDStr := c.Locals("tenant_id").(string)
	if uuid.UUID(nota.EmpresaID.Bytes).String() != tenantIDStr {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"erro": "Acesso negado para nota fiscal de outra empresa"})
	}

	return c.JSON(nota)
}

// 3. CancelarNota realiza o cancelamento da nota (CANCELADA)
func (h *FiscalHandler) CancelarNota(c *fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID inválido"})
	}

	ctx := context.Background()
	// Verifica se a nota pertence a empresa
	nota, err := h.queries.GetNotaFiscal(ctx, pgtype.UUID{Bytes: id, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"erro": "Nota fiscal não encontrada"})
	}

	tenantIDStr := c.Locals("tenant_id").(string)
	if uuid.UUID(nota.EmpresaID.Bytes).String() != tenantIDStr {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"erro": "Acesso negado para nota fiscal de outra empresa"})
	}

	if nota.Status == "CANCELADA" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Nota fiscal já está cancelada"})
	}

	notaAtualizada, err := h.queries.UpdateNotaFiscalStatus(ctx, db.UpdateNotaFiscalStatusParams{
		ID:     pgtype.UUID{Bytes: id, Valid: true},
		Status: "CANCELADA",
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao cancelar nota fiscal"})
	}

	return c.JSON(notaAtualizada)
}

// Helpers
func gerarChaveSEFAZ(cnpj string, tipo string, numero int, serie int) string {
	ufSP := "35" // São Paulo
	data := time.Now().Format("0601") // YYMM
	modelo := mapTipoDocumento(tipo)
	// Formata CNPJ com 14 dígitos
	cnpjFormatado := fmt.Sprintf("%014s", cnpj)
	if len(cnpjFormatado) > 14 {
		cnpjFormatado = cnpjFormatado[:14]
	}
	serieFormatada := fmt.Sprintf("%03d", serie)
	numFormatado := fmt.Sprintf("%09d", numero)
	tipoEmissao := "1" // Normal
	codigoRandom := fmt.Sprintf("%08d", rand.Intn(99999999))

	chaveParcial := fmt.Sprintf("%s%s%s%s%s%s%s%s", ufSP, data, cnpjFormatado, modelo, serieFormatada, numFormatado, tipoEmissao, codigoRandom)

	// Cálculo simples do dígito verificador (Módulo 11)
	soma := 0
	peso := 2
	for i := len(chaveParcial) - 1; i >= 0; i-- {
		soma += int(chaveParcial[i]-'0') * peso
		peso++
		if peso > 9 {
			peso = 2
		}
	}
	resto := soma % 11
	digitoVerificador := 0
	if resto > 1 {
		digitoVerificador = 11 - resto
	}

	return fmt.Sprintf("%s%d", chaveParcial, digitoVerificador)
}

func mapTipoDocumento(tipo string) string {
	if tipo == "NFE" {
		return "55"
	}
	return "65" // NFCE
}

func numeric(val float64) pgtype.Numeric {
	num := pgtype.Numeric{}
	_ = num.Scan(fmt.Sprintf("%f", val))
	return num
}
