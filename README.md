# Vaelis ERP - Monolito Modular Multitenant

Um sistema ERP de alta performance, modular e multitenant desenvolvido em **Go**, projetado para suportar desde operações tradicionais (estoque, financeiro, fiscal, RH) até módulos de nicho contratados sob demanda (Frente de Caixa/Self-Checkout, KDS para restaurantes, Ordens de Serviço e Biometria Facial).

---

## 🚀 Arquitetura & Tecnologias
* **Linguagem**: Go (Golang) com o framework de alto desempenho **Fiber v2**.
* **Banco de Dados**: PostgreSQL com pool de conexões otimizado via **pgx/v5**.
* **Mapeador Relacional**: **sqlc** para geração de código Go estritamente tipado a partir de queries SQL puras (sem sobrecarga de ORM).
* **Segurança**: Autenticação **JWT** com suporte a controle de acesso baseado em papéis (**RBAC**) e isolamento físico/lógico multitenant por **Add-ons**.
* **Concorrência**: WebSocket assíncrono para o painel de cozinha (KDS) e concorrência segura com Mutex e Bloqueio Pessimista (`FOR UPDATE`) nas transações críticas de estoque.

---

## 📦 Módulos Principais & Add-ons Premium

### 💼 Módulos Core (Base do ERP)
1. **Autenticação & Segurança**:
   * Controle estrito de multi-tenancy e gerenciamento de privilégios.
   * Sistema de **Impersonation**: Suporte técnico pode assumir a conta de um tenant temporariamente com logs de auditoria detalhados.
2. **Estoque & Compras**:
   * Grade de produtos (controle flexível de SKUs por tamanho e cor).
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
   * Motor de PDV preparado para contingência offline. Sincroniza dados em SQLite local via pontes Wails e faz upload da fila de vendas rejeitando duplicidades via UUID.
2. **Fast-Food & KDS (`modulo_kds`)**:
   * Sistema de comandas e mesas integrado a telas de cozinha (KDS) via WebSockets.
   * Alertas de **SLA de preparo**: Itens com tempo de cozinha acima de 15 minutos são destacados.
3. **Serviços & OS (`modulo_ordem_servico`)**:
   * Abertura de Ordens de Serviço (OS) com separação física de autopeças e mão de obra.
   * Integração de **Comissões**: Faturamento de OS gera automaticamente contas a pagar de 10% sobre a mão de obra para o técnico designado.
4. **Ponto por Reconhecimento Facial (`modulo_ponto_facial`)**:
   * Permite registro de batidas de jornada (ponto) via aplicativo mobile/tablet validando a semelhança facial do funcionário, registrando latitude/longitude GPS e gerando comprovantes digitais.

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
4. Execute o servidor de desenvolvimento:
   ```bash
   go run cmd/api/main.go
   ```

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
