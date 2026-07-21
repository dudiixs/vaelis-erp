# Vaelis ERP - Monolito Modular Multitenant

Um sistema ERP de alta performance, modular e multitenant desenvolvido em **Go**, projetado para suportar desde operações tradicionais (estoque, financeiro, fiscal, RH) até módulos de nicho contratados sob demanda (Frente de Caixa/Self-Checkout, KDS para restaurantes, Ordens de Serviço e Biometria Facial).

---

## 🚀 Arquitetura & Tecnologias
* **Backend (Core)**: Go (Golang) com o framework de alto desempenho **Fiber v2**.
* **Frontend (SPA)**: React + TypeScript + Vite, estilizado com CSS Nativo (tema escuro HSL, micro-animações, design responsivo).
* **Banco de Dados**: PostgreSQL com pool de conexões otimizado via **pgx/v5**.
* **Mapeador Relacional**: **sqlc** para geração de código Go estritamente tipado a partir de queries SQL puras (sem sobrecarga de ORM).
* **Segurança**: Autenticação **JWT** com suporte a controle de acesso baseado em papéis (**RBAC**), isolamento físico/lógico multitenant e login em duas etapas (validação de Tenant ID).
* **Concorrência**: WebSocket assíncrono para o painel de cozinha (KDS) e concorrência segura com Mutex e Bloqueio Pessimista (`FOR UPDATE`) nas transações críticas de estoque.

---

## 📦 Módulos Principais & Add-ons Premium

### 💼 Módulos Core (Base do ERP)
1. **Autenticação & Segurança**:
   * Controle estrito de multi-tenancy e gerenciamento de privilégios.
   * Sistema de **Impersonation**: Suporte técnico pode assumir a conta de um tenant temporariamente com logs de auditoria detalhados.
2. **Estoque & Compras**:
   * Grade de produtos (controle flexível de SKUs por tamanho e cor).
   * **Controle por Lote e Validade (FEFO)**: Registro de lotes de produtos com datas de validade, sugerindo automaticamente saídas baseadas no primeiro a expirar para evitar desperdício.
   * Fluxo de Solicitação de Compras -> Orçamento de Fornecedores -> Pedido de Compras com alçadas de aprovação.
   * **Sugestão de Compra Inteligente**: Endpoint analisa estoques de segurança mínimos e gera sugestões de compra estimando custos financeiros.
3. **Financeiro**:
   * Contas a Pagar e Receber integrados.
   * Controle de **PCO (Planejamento e Controle Orçamentário)** com alertas de estouro por categoria de despesas.
   * Integração de **Borderôs de Pagamento** para os principais bancos (Itaú, Bradesco, Santander, Banco do Brasil).
   * **Dashboard Categórico**: Métricas prontas para o frontend renderizar gráficos de fluxo de caixa por origem.
4. **Módulo Fiscal**:
   * Emissão de Notas Fiscais em background consumindo fila assíncrona para evitar gargalos na comunicação com o SEFAZ.

### 🧩 Add-ons de Nicho (Contratados Sob Demanda)
1. **Varejo & Self-Checkout (`modulo_self_checkout`)**:
   * Motor de PDV preparado para contingência offline. Sincroniza dados em SQLite local e faz upload da fila de vendas.
   * **Reconciliação CRDT**: Sincronização offline baseada em deltas de estoque relativos (PN-Counters) em vez de valores absolutos, evitando conflitos com edições simultâneas no Painel Web.
2. **Fast-Food & KDS (`modulo_kds`)**:
   * Sistema de comandas e mesas integrado a telas de cozinha (KDS) via WebSockets.
   * Alertas de **SLA de preparo**: Itens com tempo de cozinha acima de 15 minutos são destacados.
3. **Serviços & OS (`modulo_ordem_servico`)**:
   * Abertura de Ordens de Serviço (OS) com separação física de autopeças e mão de obra.
   * Integração de **Comissões**: Faturamento de OS gera automaticamente contas a pagar de 10% sobre a mão de obra para o técnico designado.
4. **Ponto por Reconhecimento Facial & Geofencing (`modulo_ponto_facial`)**:
   * Registro de batidas de jornada (ponto) validando a semelhança facial do funcionário.
   * **Ponto Georreferenciado**: Integração com API de Geolocalização do navegador/celular para validar se a batida foi feita dentro do raio de tolerância (cerca geográfica de 200 metros) do endereço cadastrado da empresa.
5. **E-commerce & Omnichannel**:
   * Integração bidirecional com marketplaces (Shopee, Mercado Livre, etc.). A venda física no PDV atualiza o estoque instantaneamente nos e-commerces integrados.
6. **CRM & Fidelização de Clientes (Cashback)**:
   * Identificação de CPF na venda do caixa, com pontuações automáticas e resgate de Cashback para abatimento direto no total de compras futuras.
7. **Logística & Delivery (Roteirização)**:
   * Agrupamento inteligente de entregas geográficas pendentes (por CEP/Bairro) gerando rotas ordenadas otimizadas para os motoristas e links rápidos de rastreamento via WhatsApp.
8. **Contratos e Cobrança Recorrente**:
   * Gestão de assinaturas mensais ou contratos recorrentes com faturamento Pix/boleto automatizado que alimenta diretamente o Contas a Receber da empresa.

---

## 🛠️ Como Executar o Projeto

### Pré-requisitos
* **Go** (versão 1.20 ou superior)
* **Docker** & **Docker Compose**

### Instalação e Inicialização
1. Clone este repositório.
2. Configure as variáveis de ambiente no arquivo `.env`.
3. Inicie o contêiner do banco de dados PostgreSQL:
   ```bash
   docker-compose up -d
   ```
4. Execute o servidor de desenvolvimento do backend:
   ```bash
   go run cmd/api/main.go
   ```

### Inicialização do Frontend
1. Navegue até o diretório do frontend:
   ```bash
   cd frontend
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Execute o servidor de desenvolvimento do Vite:
   ```bash
   npm run dev
   ```
4. O painel estará disponível em `http://localhost:5173`.

---

## 🧪 Suíte de Testes
Toda a lógica de negócios pode ser testada em memória (sem dependências de banco de dados ativo) rodando:

```bash
# Executa todos os testes
go test ./...

# Executa testes específicos com log verboso
go test -v ./internal/modules/rh
go test -v ./internal/modules/servicos
```
