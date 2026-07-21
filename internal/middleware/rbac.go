package middleware

import (
	"context"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"erp/internal/platform/database/db"
)

// ValidarAcesso verifica o licenciamento da Empresa (Add-ons) e as permissões do Usuário (RBAC)
func ValidarAcesso(pool *pgxpool.Pool, moduloID string, acao string) fiber.Handler {
	queries := db.New(pool)

	return func(c *fiber.Ctx) error {
		// 1. Recupera IDs do contexto (injetados pelo middleware de autenticação)
		tenantIDStr := c.Locals("tenant_id")
		userIDStr := c.Locals("user_id")
		isMasterLoc := c.Locals("is_master")

		if tenantIDStr == nil || userIDStr == nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"erro": "Usuário não autenticado",
			})
		}

		tenantID, err := uuid.Parse(tenantIDStr.(string))
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"erro": "Tenant ID inválido",
			})
		}

		userID, err := uuid.Parse(userIDStr.(string))
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"erro": "User ID inválido",
			})
		}

		ctx := context.Background()

		// 2. Valida Empresa (Tenant) e seus Add-ons
		empresa, err := queries.GetEmpresa(ctx, pgtype.UUID{Bytes: tenantID, Valid: true})
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
				"erro": "Empresa não encontrada",
			})
		}

		if empresa.Status.String != "ATIVO" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"erro": "Acesso suspenso. Empresa inativa.",
			})
		}

		// Checa se o módulo solicitado é um add-on e se está habilitado
		addonHabilitado := true
		switch strings.ToUpper(moduloID) {
		case "RH":
			addonHabilitado = empresa.ModuloRh.Bool
		case "KDS":
			addonHabilitado = empresa.ModuloKds.Bool
		case "MESAS_COMANDAS":
			addonHabilitado = empresa.ModuloMesasComandas.Bool
		case "ORDEM_SERVICO":
			addonHabilitado = empresa.ModuloOrdemServico.Bool
		case "GRADE_PRODUTOS":
			addonHabilitado = empresa.ModuloGradeProdutos.Bool
		case "SELF_CHECKOUT":
			addonHabilitado = empresa.ModuloSelfCheckout.Bool
		}

		if !addonHabilitado {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"erro": "Módulo não contratado no plano da empresa.",
			})
		}

		// 3. Valida se o Usuário é Master (se for Master, tem acesso livre a todos os módulos ativos da empresa)
		isMaster := false
		if isMasterLoc != nil {
			isMaster = isMasterLoc.(bool)
		}

		if isMaster {
			return c.Next()
		}

		// 4. Valida as permissões do usuário comum (RBAC)
		permissao, err := queries.GetUsuarioPermissionForModule(ctx, db.GetUsuarioPermissionForModuleParams{
			UsuarioID: pgtype.UUID{Bytes: userID, Valid: true},
			ModuloID:  strings.ToUpper(moduloID),
		})

		if err != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"erro": "Acesso negado para este usuário neste módulo.",
			})
		}

		permitido := false
		switch strings.ToLower(acao) {
		case "visualizar", "read", "get":
			permitido = permissao.PodeVisualizar.Bool
		case "criar", "create", "post":
			permitido = permissao.PodeCriar.Bool
		case "editar", "update", "put", "patch":
			permitido = permissao.PodeEditar.Bool
		case "deletar", "delete":
			permitido = permissao.PodeDeletar.Bool
		}

		if !permitido {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"erro": "Você não tem permissão para realizar esta ação neste módulo.",
			})
		}

		return c.Next()
	}
}
