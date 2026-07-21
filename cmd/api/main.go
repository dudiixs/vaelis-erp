package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"erp/internal/middleware"
	"erp/internal/modules/auth"
	"erp/internal/modules/estoque"
	"erp/internal/modules/financeiro"
	"erp/internal/modules/fiscal"
	"erp/internal/modules/kds"
	"erp/internal/modules/master"
	"erp/internal/modules/pdv"
	"erp/internal/modules/rh"
	"erp/internal/modules/servicos"
	"erp/internal/platform/config"
	"erp/internal/platform/database"
	"erp/internal/platform/token"
	"github.com/gofiber/websocket/v2"
)

func main() {
	// 1. Carrega as configurações
	cfg := config.LoadConfig()

	// 2. Inicializa o pool de conexões do banco de dados
	pool, err := database.NewConnectionPool(cfg)
	if err != nil {
		log.Fatalf("Erro crítico ao inicializar o banco de dados: %v", err)
	}
	defer pool.Close()

	// 3. Inicializa os serviços core
	jwtService := token.NewJWTService(cfg.JWTSecret, cfg.JWTExpiryHours)

	// 4. Inicializa os handlers dos módulos
	authHandler := auth.NewAuthHandler(pool, jwtService)
	estoqueHandler := estoque.NewEstoqueHandler(pool)
	rhHandler := rh.NewRHHandler(pool)
	financeiroHandler := financeiro.NewFinanceiroHandler(pool)
	fiscalHandler := fiscal.NewFiscalHandler(pool)
	pdvHandler := pdv.NewPDVHandler(pool)
	kdsHandler := kds.NewKDSHandler(pool)
	servicosHandler := servicos.NewServicosHandler(pool)
	masterHandler := master.NewMasterHandler(pool, jwtService)

	// Inicializa e Inicia o Worker de Mensageria Fiscal Assíncrona em background
	fiscalWorker := fiscal.NewFiscalMessagingWorker(pool)
	fiscalWorker.Start()
	defer fiscalWorker.Stop()

	// 5. Configura a aplicação Go Fiber
	app := fiber.New(fiber.Config{
		AppName: "ERP Modular Backend Core v1",
	})

	// Middlewares globais úteis
	app.Use(logger.New())
	app.Use(recover.New())

	// Rota pública de Health Check
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"status": "online",
			"modulo": "Core ERP",
		})
	})

	// Rota públicas de Autenticação
	authGroup := app.Group("/auth")
	authGroup.Post("/register", authHandler.Register)
	authGroup.Post("/login", authHandler.Login)

	// Middleware de autenticação JWT para rotas protegidas
	authMiddleware := middleware.NewAuthMiddleware(jwtService)

	// Configuração de permissões (apenas para Master da própria empresa)
	authGroup.Post("/permissions", authMiddleware, authHandler.SetPermission)

	// Grupo API v1
	api := app.Group("/api/v1", authMiddleware)

	// --- Módulo de Estoque (Add-on 'modulo_grade_produtos' para produtos com grade) ---
	api.Post("/estoque/produtos", middleware.ValidarAcesso(pool, "GRADE_PRODUTOS", "criar"), estoqueHandler.CreateProduto)
	api.Post("/estoque/solicitacoes", middleware.ValidarAcesso(pool, "ESTOQUE", "criar"), estoqueHandler.CreateSolicitacao)
	api.Post("/estoque/pedidos", middleware.ValidarAcesso(pool, "COMPRAS", "criar"), estoqueHandler.CreatePedido)
	api.Post("/estoque/entradas", middleware.ValidarAcesso(pool, "COMPRAS", "criar"), estoqueHandler.ProcessEntrada)
	api.Post("/estoque/solicitacoes/:id/orcamentos", middleware.ValidarAcesso(pool, "COMPRAS", "criar"), estoqueHandler.CreateOrcamento)
	api.Post("/estoque/orcamentos/:id/escolher", middleware.ValidarAcesso(pool, "COMPRAS", "criar"), estoqueHandler.EscolherOrcamento)
	api.Put("/estoque/pedidos/:id/aprovar", middleware.ValidarAcesso(pool, "COMPRAS", "editar"), estoqueHandler.AprovarPedido)
	api.Get("/estoque/alertas", middleware.ValidarAcesso(pool, "ESTOQUE", "visualizar"), estoqueHandler.ListAlertasEstoque)
	api.Get("/estoque/sugestoes-compra", middleware.ValidarAcesso(pool, "ESTOQUE", "visualizar"), estoqueHandler.ObterSugestoesCompra)

	// --- Módulo de RH (Add-on 'modulo_rh') ---
	api.Post("/rh/colaboradores", middleware.ValidarAcesso(pool, "RH", "criar"), rhHandler.CreateColaborador)
	api.Post("/rh/ponto", middleware.ValidarAcesso(pool, "RH", "criar"), rhHandler.CreatePonto)
	api.Post("/rh/folha/fechamento", middleware.ValidarAcesso(pool, "RH", "criar"), rhHandler.FechamentoFolha)
	api.Put("/rh/colaboradores/:id/facial-template", middleware.ValidarAcesso(pool, "RH", "editar"), rhHandler.CadastrarFaceColaborador)
	api.Post("/rh/ponto/facial", middleware.ValidarAcesso(pool, "RH", "criar"), rhHandler.RegistrarPontoFacial)

	// --- Módulo Financeiro (Módulo core) ---
	api.Post("/financeiro/pagar", middleware.ValidarAcesso(pool, "FINANCEIRO", "criar"), financeiroHandler.CreateContaPagarManual)
	api.Post("/financeiro/receber", middleware.ValidarAcesso(pool, "FINANCEIRO", "criar"), financeiroHandler.CreateContaReceberManual)
	api.Get("/financeiro/pagar", middleware.ValidarAcesso(pool, "FINANCEIRO", "visualizar"), financeiroHandler.ListContasPagar)
	api.Get("/financeiro/receber", middleware.ValidarAcesso(pool, "FINANCEIRO", "visualizar"), financeiroHandler.ListContasReceber)
	api.Put("/financeiro/pagar/:id/baixar", middleware.ValidarAcesso(pool, "FINANCEIRO", "editar"), financeiroHandler.BaixarContaPagar)
	api.Put("/financeiro/receber/:id/baixar", middleware.ValidarAcesso(pool, "FINANCEIRO", "editar"), financeiroHandler.BaixarContaReceber)
	api.Post("/financeiro/banco/configurar", middleware.ValidarAcesso(pool, "FINANCEIRO", "editar"), financeiroHandler.SaveBankConfig)
	api.Get("/financeiro/banco/configuracoes", middleware.ValidarAcesso(pool, "FINANCEIRO", "visualizar"), financeiroHandler.GetBankConfigs)
	api.Post("/financeiro/borderos", middleware.ValidarAcesso(pool, "FINANCEIRO", "criar"), financeiroHandler.CreateBorderop)
	api.Post("/financeiro/borderos/:id/adicionar", middleware.ValidarAcesso(pool, "FINANCEIRO", "editar"), financeiroHandler.VincularContasAoBorderop)
	api.Post("/financeiro/borderos/:id/transmitir", middleware.ValidarAcesso(pool, "FINANCEIRO", "editar"), financeiroHandler.TransmitirBorderop)
	api.Post("/financeiro/pco", middleware.ValidarAcesso(pool, "FINANCEIRO", "criar"), financeiroHandler.CreatePcoLimit)
	api.Get("/financeiro/pco/comparativo/:mes/:ano", middleware.ValidarAcesso(pool, "FINANCEIRO", "visualizar"), financeiroHandler.GetPcoComparativo)
	api.Get("/financeiro/fluxo-caixa", middleware.ValidarAcesso(pool, "FINANCEIRO", "visualizar"), financeiroHandler.GetFluxoCaixa)
	api.Get("/financeiro/dashboard/categorias", middleware.ValidarAcesso(pool, "FINANCEIRO", "visualizar"), financeiroHandler.GetConsolidadoCategorias)

	// --- Módulo Fiscal ---
	api.Post("/fiscal/emitir", middleware.ValidarAcesso(pool, "PDV", "criar"), fiscalHandler.EmitirNota)
	api.Get("/fiscal/nota/:chave", middleware.ValidarAcesso(pool, "PDV", "visualizar"), fiscalHandler.GetNotaFiscal)
	api.Put("/fiscal/nota/:id/cancelar", middleware.ValidarAcesso(pool, "PDV", "editar"), fiscalHandler.CancelarNota)

	// --- Módulo de Frente de Caixa (PDV / Self-Checkout) ---
	api.Get("/pdv/sync/produtos", middleware.ValidarAcesso(pool, "SELF_CHECKOUT", "visualizar"), pdvHandler.SyncCatalogoProdutos)
	api.Post("/pdv/sync/vendas", middleware.ValidarAcesso(pool, "SELF_CHECKOUT", "criar"), pdvHandler.ProcessarFilaContingencia)
	api.Post("/pdv/autorizar-supervisor", middleware.ValidarAcesso(pool, "SELF_CHECKOUT", "criar"), pdvHandler.AutorizarSupervisor)

	// --- Módulo Fast-Food (KDS & Comandas/Mesas) ---
	api.Post("/kds/comandas", middleware.ValidarAcesso(pool, "MESAS_COMANDAS", "criar"), kdsHandler.AbrirComanda)
	api.Post("/kds/comandas/:id/itens", middleware.ValidarAcesso(pool, "MESAS_COMANDAS", "criar"), kdsHandler.AdicionarItensComanda)
	api.Get("/kds/itens", middleware.ValidarAcesso(pool, "KDS", "visualizar"), kdsHandler.ListItensKds)
	api.Put("/kds/itens/:itemId", middleware.ValidarAcesso(pool, "KDS", "editar"), kdsHandler.UpdateKdsStatus)
	api.Post("/kds/comandas/:id/fechar", middleware.ValidarAcesso(pool, "MESAS_COMANDAS", "editar"), kdsHandler.FecharComanda)

	// --- Módulo Serviços (Ordens de Serviço - OS) ---
	api.Post("/servicos/os", middleware.ValidarAcesso(pool, "ORDEM_SERVICO", "criar"), servicosHandler.CreateOS)
	api.Get("/servicos/os", middleware.ValidarAcesso(pool, "ORDEM_SERVICO", "visualizar"), servicosHandler.ListOS)
	api.Get("/servicos/os/:id", middleware.ValidarAcesso(pool, "ORDEM_SERVICO", "visualizar"), servicosHandler.GetOS)
	api.Post("/servicos/os/:id/faturar", middleware.ValidarAcesso(pool, "ORDEM_SERVICO", "editar"), servicosHandler.FaturarOS)

	// --- Painel Master da Software House ---
	api.Put("/master/tenants/:id/licenca", masterHandler.UpdateTenantLicense)
	api.Post("/master/impersonate", masterHandler.ImpersonateTenantUser)
	api.Get("/master/stats", masterHandler.GetGlobalStats)
	api.Get("/master/audit", masterHandler.GetGlobalAuditLogs)

	// --- WebSocket Gateway para KDS Real-time ---
	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	app.Get("/ws/kds", websocket.New(kdsHandler.HandleWS))

	// Inicia a escuta na porta configurada em uma goroutine
	go func() {
		log.Printf("Servidor HTTP rodando na porta %s...", cfg.Port)
		if err := app.Listen(":" + cfg.Port); err != nil {
			log.Printf("Aviso: Servidor Fiber encerrado: %v", err)
		}
	}()

	// Ouvinte de sinal de encerramento gracioso (Graceful Shutdown)
	cSignal := make(chan os.Signal, 1)
	signal.Notify(cSignal, os.Interrupt, syscall.SIGTERM)

	<-cSignal
	log.Println("[SHUTDOWN] Sinal de encerramento recebido. Desligando serviços de forma graciosa...")

	// 1. Encerra o servidor web (Fiber) impedindo novas requisições
	if err := app.Shutdown(); err != nil {
		log.Printf("[SHUTDOWN] Erro ao encerrar Fiber: %v", err)
	}

	// 2. Encerra workers em background
	fiscalWorker.Stop()

	// 3. Libera o pool de conexões com o banco de dados
	pool.Close()

	log.Println("[SHUTDOWN] ERP Modular Core desligado com sucesso.")
}
