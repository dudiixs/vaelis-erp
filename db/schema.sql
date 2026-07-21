-- Habilita extensão para geração de UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Empresas (Tenants) com Feature Flags
CREATE TABLE empresas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    razao_social VARCHAR(255) NOT NULL,
    cnpj VARCHAR(14) UNIQUE NOT NULL,
    nicho VARCHAR(50) NOT NULL, -- 'VAREJO', 'FAST_FOOD', 'VESTUARIO', 'SERVICOS'
    
    -- Feature Flags (Add-ons Contratados)
    modulo_rh BOOLEAN DEFAULT FALSE,
    modulo_kds BOOLEAN DEFAULT FALSE,
    modulo_mesas_comandas BOOLEAN DEFAULT FALSE,
    modulo_ordem_servico BOOLEAN DEFAULT FALSE,
    modulo_grade_produtos BOOLEAN DEFAULT FALSE,
    modulo_self_checkout BOOLEAN DEFAULT FALSE,
    modulo_ponto_facial BOOLEAN DEFAULT FALSE,
    
    status VARCHAR(20) DEFAULT 'ATIVO',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Usuários
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    cargo VARCHAR(100),
    is_master BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'ATIVO',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Permissões por Usuário (Matriz RBAC)
CREATE TABLE usuario_permissoes (
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    modulo_id VARCHAR(50) NOT NULL, -- 'FINANCEIRO', 'COMPRAS', 'RH', 'ESTOQUE', 'PDV'
    pode_visualizar BOOLEAN DEFAULT FALSE,
    pode_criar BOOLEAN DEFAULT FALSE,
    pode_editar BOOLEAN DEFAULT FALSE,
    pode_deletar BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (usuario_id, modulo_id)
);

-- 4. Logs de Auditoria Master (Software House Backoffice)
CREATE TABLE logs_auditoria_master (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_master_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    acao VARCHAR(100) NOT NULL, -- 'IMPERSONATE', 'ALTEROU_ADDON', 'SUSPENDEU_TENANT'
    detalhes JSONB,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Módulo de Estoque - Produtos (Pai)
CREATE TABLE produtos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    sku_pai VARCHAR(100) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_sku_pai_per_company UNIQUE (empresa_id, sku_pai)
);

-- 6. Módulo de Estoque - SKUs de Grade (Filhos)
CREATE TABLE produtos_grade (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    produto_id UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    cor VARCHAR(50),
    tamanho VARCHAR(50),
    codigo_barras VARCHAR(100),
    estoque_atual INT NOT NULL DEFAULT 0,
    estoque_minimo INT NOT NULL DEFAULT 0,
    preco_venda NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    preco_custo NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_sku_filho_per_company UNIQUE (sku)
);

-- 7. Compras - Solicitação de Compra (SC)
CREATE TABLE solicitacoes_compra (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- 'PENDENTE', 'APROVADA', 'REJEITADA'
    observacoes TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Compras - Itens de Solicitação
CREATE TABLE solicitacoes_compra_itens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    solicitacao_compra_id UUID NOT NULL REFERENCES solicitacoes_compra(id) ON DELETE CASCADE,
    produto_grade_id UUID NOT NULL REFERENCES produtos_grade(id) ON DELETE CASCADE,
    quantidade INT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Compras - Pedido de Compra (PC)
CREATE TABLE pedidos_compra (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    solicitacao_compra_id UUID REFERENCES solicitacoes_compra(id) ON DELETE SET NULL,
    fornecedor_nome VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- 'PENDENTE', 'FATURADO', 'CANCELADO'
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Compras - Itens do Pedido de Compra
CREATE TABLE pedidos_compra_itens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_compra_id UUID NOT NULL REFERENCES pedidos_compra(id) ON DELETE CASCADE,
    produto_grade_id UUID NOT NULL REFERENCES produtos_grade(id) ON DELETE CASCADE,
    quantidade INT NOT NULL,
    preco_custo NUMERIC(10, 2) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Compras - Entrada de Estoque
CREATE TABLE entradas_estoque (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    pedido_compra_id UUID REFERENCES pedidos_compra(id) ON DELETE SET NULL,
    chave_nfe VARCHAR(44),
    xml_nfe TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Compras - Itens de Entrada
CREATE TABLE entradas_estoque_itens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entrada_estoque_id UUID NOT NULL REFERENCES entradas_estoque(id) ON DELETE CASCADE,
    produto_grade_id UUID NOT NULL REFERENCES produtos_grade(id) ON DELETE CASCADE,
    quantidade INT NOT NULL,
    preco_custo NUMERIC(10, 2) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 22. Financeiro - Lotes de Borderô de Pagamento (Criado antes para FK)
CREATE TABLE borderos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    descricao VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'EM_DIGITACAO', -- 'EM_DIGITACAO', 'ENVIADO_BANCO', 'PAGO'
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. Financeiro - Contas a Pagar
CREATE TABLE contas_pagar (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    borderop_id UUID REFERENCES borderos(id) ON DELETE SET NULL,
    descricao VARCHAR(255) NOT NULL,
    valor NUMERIC(10, 2) NOT NULL,
    data_vencimento DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- 'PENDENTE', 'PAGO'
    origem VARCHAR(50) NOT NULL, -- 'FOLHA_PAGAMENTO', 'COMPRAS', 'AVULSO'
    origem_id UUID,
    data_pagamento TIMESTAMP,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. Financeiro - Contas a Receber
CREATE TABLE contas_receber (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    descricao VARCHAR(255) NOT NULL,
    valor NUMERIC(10, 2) NOT NULL,
    data_vencimento DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE', -- 'PENDENTE', 'RECEBIDO'
    origem VARCHAR(50) NOT NULL, -- 'VENDA_PDV', 'AVULSO'
    origem_id UUID,
    data_pagamento TIMESTAMP,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. RH/DP - Colaboradores (Prontuário)
CREATE TABLE colaboradores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    cpf VARCHAR(11) NOT NULL,
    cargo VARCHAR(100) NOT NULL,
    salario NUMERIC(10, 2) NOT NULL,
    data_admissao DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ATIVO', -- 'ATIVO', 'AFASTADO', 'DEMITIDO'
    facial_biometria_template TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_cpf_per_company UNIQUE (empresa_id, cpf)
);

-- 16. RH/DP - Registro de Ponto
CREATE TABLE ponto_registros (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL, -- 'ENTRADA', 'SAIDA_ALMOCO', 'RETORNO_ALMOCO', 'SAIDA'
    horario TIMESTAMP NOT NULL,
    localizacao_gps VARCHAR(100),
    foto_hash VARCHAR(255),
    facial_similarity NUMERIC(5, 2),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 17. RH/DP - Folhas de Pagamento
CREATE TABLE folhas_pagamento (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    mes_referencia VARCHAR(7) NOT NULL, -- 'MM/AAAA' (ex: '07/2026')
    status VARCHAR(20) NOT NULL DEFAULT 'RASCUNHO', -- 'RASCUNHO', 'FECHADA'
    total_proventos NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_descontos NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_liquido NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_mes_ref_per_company UNIQUE (empresa_id, mes_referencia)
);

-- 18. RH/DP - Itens da Folha (Holerites individuais)
CREATE TABLE folha_itens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    folha_pagamento_id UUID NOT NULL REFERENCES folhas_pagamento(id) ON DELETE CASCADE,
    colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
    salario_base NUMERIC(10, 2) NOT NULL,
    horas_extras NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    valor_horas_extras NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    desconto_inss NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    desconto_irrf NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    outros_descontos NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    liquido_a_receber NUMERIC(10, 2) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 19. Módulo Fiscal - Notas Fiscais Emitidas
CREATE TABLE notas_fiscais (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    tipo VARCHAR(10) NOT NULL, -- 'NFE', 'NFCE'
    chave_acesso VARCHAR(44) UNIQUE NOT NULL,
    numero INT NOT NULL,
    serie INT NOT NULL,
    valor_total NUMERIC(10, 2) NOT NULL,
    xml_content TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'AUTORIZADA', -- 'AUTORIZADA', 'CANCELADA', 'CONTINGENCIA'
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 20. Compras - Orçamento de Fornecedores (Cotações)
CREATE TABLE orcamentos_fornecedores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    solicitacao_compra_id UUID NOT NULL REFERENCES solicitacoes_compra(id) ON DELETE CASCADE,
    fornecedor_nome VARCHAR(255) NOT NULL,
    valor_total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    prazo_entrega_dias INT NOT NULL DEFAULT 0,
    escolhido BOOLEAN DEFAULT FALSE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 21. Compras - Itens do Orçamento de Fornecedores
CREATE TABLE orcamentos_fornecedores_itens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    orcamento_fornecedor_id UUID NOT NULL REFERENCES orcamentos_fornecedores(id) ON DELETE CASCADE,
    produto_grade_id UUID NOT NULL REFERENCES produtos_grade(id) ON DELETE CASCADE,
    quantidade INT NOT NULL,
    preco_unitario NUMERIC(10, 2) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 23. Financeiro - Planejamento e Controle Orçamentário (PCO)
CREATE TABLE pco_orcamentos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    categoria VARCHAR(100) NOT NULL, -- e.g. 'RH', 'COMPRAS', 'AVULSO'
    mes_referencia VARCHAR(7) NOT NULL, -- 'MM/AAAA' (ex: '07/2026')
    limite_orcado NUMERIC(10, 2) NOT NULL,
    valor_realizado NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_pco_ref UNIQUE (empresa_id, categoria, mes_referencia)
);

-- 24. Financeiro - Configurações de Bancos Integrados (Itaú, Bradesco, Santander, Banco do Brasil)
CREATE TABLE configuracoes_banco (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    banco_nome VARCHAR(50) NOT NULL, -- 'ITAU', 'BRADESCO', 'SANTANDER', 'BANCO_DO_BRASIL'
    client_id VARCHAR(255) NOT NULL,
    client_secret VARCHAR(255) NOT NULL,
    certificado_digital TEXT,
    token_atual VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'CONFIGURADO',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_banco_per_company UNIQUE (empresa_id, banco_nome)
);

-- 25. PDV/Frente de Caixa - Vendas
CREATE TABLE vendas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    total NUMERIC(10, 2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'CONCLUIDA', -- 'CONCLUIDA', 'CANCELADA', 'OFFLINE_SINCRONIZADA'
    forma_pagamento VARCHAR(50) NOT NULL, -- 'DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'PIX'
    chave_nfe VARCHAR(44),
    offline_uuid UUID UNIQUE, -- Evita duplicar sincronização de contingência
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 26. PDV/Frente de Caixa - Itens de Venda
CREATE TABLE venda_itens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venda_id UUID NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
    produto_grade_id UUID NOT NULL REFERENCES produtos_grade(id) ON DELETE CASCADE,
    quantidade INT NOT NULL,
    preco_unitario NUMERIC(10, 2) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 27. Módulo Fiscal - Fila de Mensageria Fiscal (NF-e / NFC-e assíncrona)
CREATE TABLE notas_fiscais_fila (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nota_fiscal_id UUID NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'AGUARDANDO_ENVIO', -- 'AGUARDANDO_ENVIO', 'ENVIADO', 'ERRO'
    tentativas INT NOT NULL DEFAULT 0,
    erro_log TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 28. Módulo Fast-Food - Comandas/Mesas
CREATE TABLE comandas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    numero_mesa_comanda VARCHAR(50) NOT NULL,
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'ABERTA', -- 'ABERTA', 'FECHADA'
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 29. Módulo Fast-Food - Itens da Comanda
CREATE TABLE comanda_itens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comanda_id UUID NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
    produto_grade_id UUID NOT NULL REFERENCES produtos_grade(id) ON DELETE CASCADE,
    quantidade INT NOT NULL,
    preco_unitario NUMERIC(10, 2) NOT NULL,
    status_cozinha VARCHAR(30) NOT NULL DEFAULT 'PENDENTE', -- 'PENDENTE', 'EM_PREPARO', 'PRONTO'
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 30. Módulo Serviços - Ordens de Serviço (OS)
CREATE TABLE ordens_servico (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cliente_nome VARCHAR(255) NOT NULL,
    veiculo_equipamento VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'ABERTA', -- 'ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'PAGA'
    total_pecas NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_mao_obra NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_geral NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 31. Módulo Serviços - Peças da OS
CREATE TABLE os_pecas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    os_id UUID NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
    produto_grade_id UUID NOT NULL REFERENCES produtos_grade(id) ON DELETE CASCADE,
    quantidade INT NOT NULL,
    preco_unitario NUMERIC(10, 2) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 32. Módulo Serviços - Serviços (Mão de Obra) da OS
CREATE TABLE os_servicos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    os_id UUID NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
    descricao VARCHAR(255) NOT NULL,
    preco_unitario NUMERIC(10, 2) NOT NULL,
    quantidade INT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 33. Painel Master - Auditoria Geral do Sistema
CREATE TABLE logs_auditoria_sistema (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    impersonator_id UUID REFERENCES usuarios(id) ON DELETE SET NULL, -- Se preenchido, indica ação via suporte
    acao VARCHAR(255) NOT NULL,
    detalhes TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
