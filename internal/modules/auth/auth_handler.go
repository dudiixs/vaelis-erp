package auth

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
	"erp/internal/platform/database/db"
	"erp/internal/platform/token"
)

type AuthHandler struct {
	pool       *pgxpool.Pool
	jwtService *token.JWTService
	queries    *db.Queries
}

func NewAuthHandler(pool *pgxpool.Pool, jwtService *token.JWTService) *AuthHandler {
	return &AuthHandler{
		pool:       pool,
		jwtService: jwtService,
		queries:    db.New(pool),
	}
}

// Register realiza o cadastro de uma nova Empresa (Tenant) e do seu Usuário Master correspondente
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"erro": "Dados da requisição inválidos",
		})
	}

	if req.RazaoSocial == "" || req.CNPJ == "" || req.EmailMaster == "" || req.SenhaMaster == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"erro": "Razão Social, CNPJ, Email e Senha do master são obrigatórios",
		})
	}

	ctx := context.Background()

	// Hash da senha do master
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.SenhaMaster), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"erro": "Erro ao processar senha",
		})
	}

	// Executa a criação da empresa e do usuário master dentro de uma Transação
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"erro": "Erro ao iniciar transação no banco",
		})
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)

	// 1. Cria a Empresa
	empresa, err := qtx.CreateEmpresa(ctx, db.CreateEmpresaParams{
		RazaoSocial:         req.RazaoSocial,
		Cnpj:                req.CNPJ,
		Nicho:               req.Nicho,
		ModuloRh:            pgtype.Bool{Bool: req.ModuloRH, Valid: true},
		ModuloKds:           pgtype.Bool{Bool: req.ModuloKDS, Valid: true},
		ModuloMesasComandas: pgtype.Bool{Bool: req.ModuloMesasComandas, Valid: true},
		ModuloOrdemServico:  pgtype.Bool{Bool: req.ModuloOrdemServico, Valid: true},
		ModuloGradeProdutos: pgtype.Bool{Bool: req.ModuloGradeProdutos, Valid: true},
		ModuloSelfCheckout:  pgtype.Bool{Bool: req.ModuloSelfCheckout, Valid: true},
		Status:              pgtype.Text{String: "ATIVO", Valid: true},
	})
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"erro": "Empresa ou CNPJ já cadastrado",
			"detalhe": err.Error(),
		})
	}

	// 2. Cria o Usuário Master
	usuario, err := qtx.CreateUsuario(ctx, db.CreateUsuarioParams{
		EmpresaID: empresa.ID,
		Nome:      req.NomeMaster,
		Email:     req.EmailMaster,
		SenhaHash: string(hashedPassword),
		Cargo:     pgtype.Text{String: "Administrador Geral", Valid: true},
		IsMaster:  pgtype.Bool{Bool: true, Valid: true},
		Status:    pgtype.Text{String: "ATIVO", Valid: true},
	})
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"erro": "Email do usuário master já está em uso",
			"detalhe": err.Error(),
		})
	}

	// Commit da transação
	if err := tx.Commit(ctx); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"erro": "Falha ao persistir transação",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"mensagem": "Empresa e usuário master criados com sucesso!",
		"empresa_id": uuid.UUID(empresa.ID.Bytes).String(),
		"usuario_id": uuid.UUID(usuario.ID.Bytes).String(),
	})
}

// Login valida credenciais e gera token JWT
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"erro": "Dados da requisição inválidos",
		})
	}

	ctx := context.Background()

	// Busca usuário por email
	usuario, err := h.queries.GetUsuarioByEmail(ctx, req.Email)
	if err != nil {
		if err == pgx.ErrNoRows {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"erro": "E-mail ou senha incorretos",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"erro": "Erro no servidor ao buscar usuário",
		})
	}

	// Verifica se a conta está ativa
	if usuario.Status.String != "ATIVO" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"erro": "Esta conta de usuário está desativada",
		})
	}

	// Compara hash da senha
	if err := bcrypt.CompareHashAndPassword([]byte(usuario.SenhaHash), []byte(req.Senha)); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"erro": "E-mail ou senha incorretos",
		})
	}

	// Busca a empresa associada
	empresa, err := h.queries.GetEmpresa(ctx, usuario.EmpresaID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"erro": "Erro ao obter detalhes da empresa vinculada",
		})
	}

	if empresa.Status.String != "ATIVO" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"erro": "Acesso negado. A empresa do usuário está inativa.",
		})
	}

	// Gera token JWT
	tokenString, err := h.jwtService.GenerateToken(uuid.UUID(usuario.ID.Bytes), uuid.UUID(empresa.ID.Bytes), usuario.Email, usuario.IsMaster.Bool)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"erro": "Erro ao gerar token de autenticação",
		})
	}

	return c.JSON(LoginResponse{
		Token:  tokenString,
		User: UserResponse{
			ID:       uuid.UUID(usuario.ID.Bytes).String(),
			Nome:     usuario.Nome,
			Email:    usuario.Email,
			Cargo:    usuario.Cargo.String,
			IsMaster: usuario.IsMaster.Bool,
		},
		Tenant: TenantResponse{
			ID:          uuid.UUID(empresa.ID.Bytes).String(),
			RazaoSocial: empresa.RazaoSocial,
			CNPJ:        empresa.Cnpj,
			Nicho:       empresa.Nicho,
		},
	})
}

// SetPermission define ou atualiza permissão de usuário
func (h *AuthHandler) SetPermission(c *fiber.Ctx) error {
	// Apenas usuários master ou com permissão administrativa deveriam acessar isso.
	// O controle de Master do solicitante é verificado via contexto.
	isMasterLoc := c.Locals("is_master")
	if isMasterLoc == nil || !isMasterLoc.(bool) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"erro": "Apenas usuários Master podem alterar permissões",
		})
	}

	var req SetPermissionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"erro": "Dados da requisição inválidos",
		})
	}

	targetUserID, err := uuid.Parse(req.UsuarioID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"erro": "ID do usuário alvo inválido",
		})
	}

	ctx := context.Background()

	// Valida se o usuário alvo existe e pertence ao mesmo tenant
	targetUser, err := h.queries.GetUsuario(ctx, pgtype.UUID{Bytes: targetUserID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"erro": "Usuário alvo não encontrado",
		})
	}

	tenantIDStr := c.Locals("tenant_id").(string)
	if uuid.UUID(targetUser.EmpresaID.Bytes).String() != tenantIDStr {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"erro": "Não é permitido alterar permissões de usuários de outras empresas",
		})
	}

	// Insere ou atualiza as permissões
	perm, err := h.queries.SetUsuarioPermission(ctx, db.SetUsuarioPermissionParams{
		UsuarioID:      pgtype.UUID{Bytes: targetUserID, Valid: true},
		ModuloID:       req.ModuloID,
		PodeVisualizar: pgtype.Bool{Bool: req.PodeVisualizar, Valid: true},
		PodeCriar:      pgtype.Bool{Bool: req.PodeCriar, Valid: true},
		PodeEditar:     pgtype.Bool{Bool: req.PodeEditar, Valid: true},
		PodeDeletar:    pgtype.Bool{Bool: req.PodeDeletar, Valid: true},
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"erro": "Erro ao atualizar permissão",
			"detalhe": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"mensagem": "Permissão atualizada com sucesso",
		"permissao": perm,
	})
}
