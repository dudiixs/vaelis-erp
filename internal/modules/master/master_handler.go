package master

import (
	"context"
	"fmt"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"erp/internal/platform/database/db"
	"erp/internal/platform/token"
)

type MasterHandler struct {
	pool       *pgxpool.Pool
	queries    *db.Queries
	jwtService *token.JWTService
}

func NewMasterHandler(pool *pgxpool.Pool, jwtService *token.JWTService) *MasterHandler {
	return &MasterHandler{
		pool:       pool,
		queries:    db.New(pool),
		jwtService: jwtService,
	}
}

// DTOs
type LicenseUpdateRequest struct {
	ModuloRh            bool `json:"modulo_rh"`
	ModuloKds           bool `json:"modulo_kds"`
	ModuloMesasComandas bool `json:"modulo_mesas_comandas"`
	ModuloOrdemServico  bool `json:"modulo_ordem_servico"`
	ModuloGradeProdutos bool `json:"modulo_grade_produtos"`
	ModuloSelfCheckout  bool `json:"modulo_self_checkout"`
}

type ImpersonateRequest struct {
	TenantID string `json:"tenant_id"`
	UserID   string `json:"user_id"`
}

// 1. UpdateTenantLicense gerencia o licenciamento/Add-ons (Feature Flags) de um tenant
func (h *MasterHandler) UpdateTenantLicense(c *fiber.Ctx) error {
	// Apenas usuários Master globais da Software House têm permissão
	isMaster := c.Locals("is_master").(bool)
	if !isMaster {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"erro": "Acesso restrito ao Painel Master da Software House"})
	}

	tenantIDStr := c.Params("id")
	targetTenantID, err := uuid.Parse(tenantIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID do tenant inválido"})
	}

	var req LicenseUpdateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	ctx := context.Background()
	company, err := h.queries.UpdateEmpresaAddons(ctx, db.UpdateEmpresaAddonsParams{
		ID:                    pgtype.UUID{Bytes: targetTenantID, Valid: true},
		ModuloRh:              pgtype.Bool{Bool: req.ModuloRh, Valid: true},
		ModuloKds:             pgtype.Bool{Bool: req.ModuloKds, Valid: true},
		ModuloMesasComandas:   pgtype.Bool{Bool: req.ModuloMesasComandas, Valid: true},
		ModuloOrdemServico:    pgtype.Bool{Bool: req.ModuloOrdemServico, Valid: true},
		ModuloGradeProdutos:   pgtype.Bool{Bool: req.ModuloGradeProdutos, Valid: true},
		ModuloSelfCheckout:    pgtype.Bool{Bool: req.ModuloSelfCheckout, Valid: true},
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao atualizar licenças"})
	}

	// Registra na auditoria do Master
	masterUserIDStr := c.Locals("user_id").(string)
	masterUserID, _ := uuid.Parse(masterUserIDStr)

	_, _ = h.queries.CreateAuditLog(ctx, db.CreateAuditLogParams{
		UsuarioMasterID: pgtype.UUID{Bytes: masterUserID, Valid: true},
		EmpresaID:       pgtype.UUID{Bytes: targetTenantID, Valid: true},
		Acao:            "LICENSE_UPDATE",
		Detalhes: []byte(fmt.Sprintf("Licenças modificadas. RH: %t | KDS: %t | OS: %t | PDV: %t", req.ModuloRh, req.ModuloKds, req.ModuloOrdemServico, req.ModuloSelfCheckout)),
	})

	return c.JSON(company)
}

// 2. ImpersonateTenantUser gera token temporário disfarçado de suporte
func (h *MasterHandler) ImpersonateTenantUser(c *fiber.Ctx) error {
	isMaster := c.Locals("is_master").(bool)
	if !isMaster {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"erro": "Acesso restrito ao Painel Master da Software House"})
	}

	var req ImpersonateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "Corpo inválido"})
	}

	targetTenantID, err := uuid.Parse(req.TenantID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID do tenant inválido"})
	}

	targetUserID, err := uuid.Parse(req.UserID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"erro": "ID do usuário inválido"})
	}

	ctx := context.Background()
	user, err := h.queries.GetUsuario(ctx, pgtype.UUID{Bytes: targetUserID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"erro": "Usuário de destino não encontrado"})
	}

	// Garante que o usuário pertence ao tenant informado
	if uuid.UUID(user.EmpresaID.Bytes) != targetTenantID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"erro": "Usuário não pertence ao tenant indicado"})
	}

	// Gera token disfarçado (Impersonated)
	masterUserIDStr := c.Locals("user_id").(string)
	masterUserID, _ := uuid.Parse(masterUserIDStr)

	tokenString, err := h.jwtService.GenerateImpersonatedToken(targetUserID, targetTenantID, masterUserID, user.Email)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao gerar token de impersonation"})
	}

	// Grava log de auditoria
	_, _ = h.queries.CreateAuditLog(ctx, db.CreateAuditLogParams{
		UsuarioMasterID: pgtype.UUID{Bytes: masterUserID, Valid: true},
		EmpresaID:       pgtype.UUID{Bytes: targetTenantID, Valid: true},
		Acao:            "IMPERSONATION_START",
		Detalhes:        []byte(fmt.Sprintf("Agente de suporte iniciou sessão no usuário: %s", user.Email)),
	})

	return c.JSON(fiber.Map{
		"mensagem":        "Impersonation de suporte iniciada com sucesso!",
		"token":           tokenString,
		"usuario_alvo":    user.Nome,
		"empresa_alvo_id": req.TenantID,
	})
}

// 3. GetGlobalStats compila KPIs globais do SaaS (totalizadores)
func (h *MasterHandler) GetGlobalStats(c *fiber.Ctx) error {
	isMaster := c.Locals("is_master").(bool)
	if !isMaster {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"erro": "Acesso restrito"})
	}

	ctx := context.Background()
	stats, err := h.queries.GetPlatformStats(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao obter KPIs globais"})
	}

	fatTotal, _ := stats.FaturamentoTotal.Float64Value()

	return c.JSON(fiber.Map{
		"total_tenants":     stats.TotalTenants,
		"total_usuarios":    stats.TotalUsuarios,
		"total_vendas":      stats.TotalVendas,
		"faturamento_total": fatTotal.Float64,
	})
}

// 4. GetGlobalAuditLogs puxa histórico completo de auditoria do sistema
func (h *MasterHandler) GetGlobalAuditLogs(c *fiber.Ctx) error {
	isMaster := c.Locals("is_master").(bool)
	if !isMaster {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"erro": "Acesso restrito"})
	}

	ctx := context.Background()
	logs, err := h.queries.ListSystemAuditLogs(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"erro": "Erro ao carregar logs de auditoria"})
	}

	return c.JSON(logs)
}

func numeric(val float64) pgtype.Numeric {
	num := pgtype.Numeric{}
	_ = num.Scan(fmt.Sprintf("%f", val))
	return num
}
