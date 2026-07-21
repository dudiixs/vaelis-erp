-- name: CreateEmpresa :one
INSERT INTO empresas (
    razao_social, cnpj, nicho, 
    modulo_rh, modulo_kds, modulo_mesas_comandas, 
    modulo_ordem_servico, modulo_grade_produtos, modulo_self_checkout, 
    status
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
)
RETURNING *;

-- name: GetEmpresa :one
SELECT * FROM empresas WHERE id = $1 LIMIT 1;

-- name: GetEmpresaByCNPJ :one
SELECT * FROM empresas WHERE cnpj = $1 LIMIT 1;

-- name: UpdateEmpresaAddons :one
UPDATE empresas
SET 
    modulo_rh = $2,
    modulo_kds = $3,
    modulo_mesas_comandas = $4,
    modulo_ordem_servico = $5,
    modulo_grade_produtos = $6,
    modulo_self_checkout = $7,
    atualizado_em = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;

-- name: CreateUsuario :one
INSERT INTO usuarios (
    empresa_id, nome, email, senha_hash, cargo, is_master, status
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
)
RETURNING *;

-- name: GetUsuario :one
SELECT * FROM usuarios WHERE id = $1 LIMIT 1;

-- name: GetUsuarioByEmail :one
SELECT * FROM usuarios WHERE email = $1 LIMIT 1;

-- name: GetUsuarioPermissions :many
SELECT * FROM usuario_permissoes WHERE usuario_id = $1;

-- name: GetUsuarioPermissionForModule :one
SELECT * FROM usuario_permissoes 
WHERE usuario_id = $1 AND modulo_id = $2 LIMIT 1;

-- name: SetUsuarioPermission :one
INSERT INTO usuario_permissoes (
    usuario_id, modulo_id, pode_visualizar, pode_criar, pode_editar, pode_deletar
) VALUES (
    $1, $2, $3, $4, $5, $6
)
ON CONFLICT (usuario_id, modulo_id) DO UPDATE
SET 
    pode_visualizar = EXCLUDED.pode_visualizar,
    pode_criar = EXCLUDED.pode_criar,
    pode_editar = EXCLUDED.pode_editar,
    pode_deletar = EXCLUDED.pode_deletar
RETURNING *;

-- name: CreateAuditLog :one
INSERT INTO logs_auditoria_master (
    usuario_master_id, empresa_id, acao, detalhes
) VALUES (
    $1, $2, $3, $4
)
RETURNING *;

-- --- Módulo Estoque & Compras ---

-- name: CreateProduto :one
INSERT INTO produtos (
    empresa_id, nome, descricao, sku_pai
) VALUES (
    $1, $2, $3, $4
)
RETURNING *;

-- name: CreateProdutoGrade :one
INSERT INTO produtos_grade (
    produto_id, sku, cor, tamanho, codigo_barras, estoque_atual, estoque_minimo, preco_venda, preco_custo
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
)
RETURNING *;

-- name: GetProduto :one
SELECT * FROM produtos WHERE id = $1 LIMIT 1;

-- name: GetProdutoGrade :one
SELECT * FROM produtos_grade WHERE id = $1 LIMIT 1;

-- name: GetProdutoGradeBySKU :one
SELECT * FROM produtos_grade WHERE sku = $1 LIMIT 1;

-- name: ListProdutos :many
SELECT * FROM produtos WHERE empresa_id = $1;

-- name: ListProdutosGrade :many
SELECT pg.* FROM produtos_grade pg
JOIN produtos p ON pg.produto_id = p.id
WHERE p.empresa_id = $1;

-- name: CreateSolicitacaoCompra :one
INSERT INTO solicitacoes_compra (
    empresa_id, usuario_id, status, observacoes
) VALUES (
    $1, $2, $3, $4
)
RETURNING *;

-- name: CreateSolicitacaoCompraItem :one
INSERT INTO solicitacoes_compra_itens (
    solicitacao_compra_id, produto_grade_id, quantidade
) VALUES (
    $1, $2, $3
)
RETURNING *;

-- name: GetSolicitacaoCompra :one
SELECT * FROM solicitacoes_compra WHERE id = $1 LIMIT 1;

-- name: GetSolicitacaoCompraItens :many
SELECT * FROM solicitacoes_compra_itens WHERE solicitacao_compra_id = $1;

-- name: UpdateSolicitacaoCompraStatus :one
UPDATE solicitacoes_compra
SET status = $2
WHERE id = $1
RETURNING *;

-- name: CreatePedidoCompra :one
INSERT INTO pedidos_compra (
    empresa_id, solicitacao_compra_id, fornecedor_nome, status, total
) VALUES (
    $1, $2, $3, $4, $5
)
RETURNING *;

-- name: CreatePedidoCompraItem :one
INSERT INTO pedidos_compra_itens (
    pedido_compra_id, produto_grade_id, quantidade, preco_custo
) VALUES (
    $1, $2, $3, $4
)
RETURNING *;

-- name: GetPedidoCompra :one
SELECT * FROM pedidos_compra WHERE id = $1 LIMIT 1;

-- name: GetPedidoCompraItens :many
SELECT * FROM pedidos_compra_itens WHERE pedido_compra_id = $1;

-- name: UpdatePedidoCompraStatus :one
UPDATE pedidos_compra
SET status = $2
WHERE id = $1
RETURNING *;

-- name: CreateEntradaEstoque :one
INSERT INTO entradas_estoque (
    empresa_id, pedido_compra_id, chave_nfe, xml_nfe
) VALUES (
    $1, $2, $3, $4
)
RETURNING *;

-- name: CreateEntradaEstoqueItem :one
INSERT INTO entradas_estoque_itens (
    entrada_estoque_id, produto_grade_id, quantidade, preco_custo
) VALUES (
    $1, $2, $3, $4
)
RETURNING *;

-- name: IncrementEstoqueGrade :one
UPDATE produtos_grade
SET estoque_atual = estoque_atual + $2, preco_custo = $3
WHERE id = $1
RETURNING *;


-- --- Módulo Financeiro ---

-- name: CreateContaPagar :one
INSERT INTO contas_pagar (
    empresa_id, descricao, valor, data_vencimento, status, origem, origem_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
)
RETURNING *;

-- name: CreateContaReceber :one
INSERT INTO contas_receber (
    empresa_id, descricao, valor, data_vencimento, status, origem, origem_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
)
RETURNING *;

-- name: ListContasPagar :many
SELECT * FROM contas_pagar WHERE empresa_id = $1 ORDER BY data_vencimento ASC;

-- name: ListContasReceber :many
SELECT * FROM contas_receber WHERE empresa_id = $1 ORDER BY data_vencimento ASC;

-- name: UpdateContaPagarStatus :one
UPDATE contas_pagar
SET status = $2, data_pagamento = $3
WHERE id = $1
RETURNING *;

-- name: UpdateContaReceberStatus :one
UPDATE contas_receber
SET status = $2, data_pagamento = $3
WHERE id = $1
RETURNING *;


-- --- Módulo RH/DP ---

-- name: CreateColaborador :one
INSERT INTO colaboradores (
    empresa_id, nome, cpf, cargo, salario, data_admissao, status
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
)
RETURNING *;

-- name: GetColaborador :one
SELECT * FROM colaboradores WHERE id = $1 LIMIT 1;

-- name: ListColaboradores :many
SELECT * FROM colaboradores WHERE empresa_id = $1;

-- name: CreatePontoRegistro :one
INSERT INTO ponto_registros (
    colaborador_id, tipo, horario
) VALUES (
    $1, $2, $3
)
RETURNING *;

-- name: GetPontoRegistros :many
SELECT pr.* FROM ponto_registros pr
JOIN colaboradores c ON pr.colaborador_id = c.id
WHERE c.empresa_id = $1 AND pr.horario >= $2 AND pr.horario <= $3
ORDER BY pr.horario ASC;

-- name: CreateFolhaPagamento :one
INSERT INTO folhas_pagamento (
    empresa_id, mes_referencia, status, total_proventos, total_descontos, total_liquido
) VALUES (
    $1, $2, $3, $4, $5, $6
)
RETURNING *;

-- name: CreateFolhaItem :one
INSERT INTO folha_itens (
    folha_pagamento_id, colaborador_id, salario_base, horas_extras, valor_horas_extras, desconto_inss, desconto_irrf, outros_descontos, liquido_a_receber
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
)
RETURNING *;

-- name: GetFolhaPagamento :one
SELECT * FROM folhas_pagamento WHERE id = $1 LIMIT 1;

-- name: GetFolhaPagamentoByMes :one
SELECT * FROM folhas_pagamento WHERE empresa_id = $1 AND mes_referencia = $2 LIMIT 1;

-- name: GetFolhaItens :many
SELECT * FROM folha_itens WHERE folha_pagamento_id = $1;

-- name: UpdateFolhaStatus :one
UPDATE folhas_pagamento
SET status = $2
WHERE id = $1
RETURNING *;


-- --- Módulo Fiscal ---

-- name: CreateNotaFiscal :one
INSERT INTO notas_fiscais (
    empresa_id, tipo, chave_acesso, numero, serie, valor_total, xml_content, status
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
)
RETURNING *;

-- name: GetNotaFiscal :one
SELECT * FROM notas_fiscais WHERE id = $1 LIMIT 1;

-- name: GetNotaFiscalByChave :one
SELECT * FROM notas_fiscais WHERE chave_acesso = $1 LIMIT 1;

-- name: ListNotasFiscais :many
SELECT * FROM notas_fiscais WHERE empresa_id = $1 ORDER BY criado_em DESC;

-- name: UpdateNotaFiscalStatus :one
UPDATE notas_fiscais
SET status = $2
WHERE id = $1
RETURNING *;

-- name: GetMaxNotaFiscalNumero :one
SELECT COALESCE(MAX(numero), 0)::int as max_numero
FROM notas_fiscais
WHERE empresa_id = $1 AND tipo = $2;

-- name: ListProdutosAbaixoEstoqueMinimo :many
SELECT pg.*, p.nome as produto_nome FROM produtos_grade pg
JOIN produtos p ON pg.produto_id = p.id
WHERE p.empresa_id = $1 AND pg.estoque_atual <= pg.estoque_minimo;

-- name: CreateOrcamentoFornecedor :one
INSERT INTO orcamentos_fornecedores (
    empresa_id, solicitacao_compra_id, fornecedor_nome, valor_total, prazo_entrega_dias, escolhido
) VALUES (
    $1, $2, $3, $4, $5, $6
)
RETURNING *;

-- name: CreateOrcamentoFornecedorItem :one
INSERT INTO orcamentos_fornecedores_itens (
    orcamento_fornecedor_id, produto_grade_id, quantidade, preco_unitario
) VALUES (
    $1, $2, $3, $4
)
RETURNING *;

-- name: ListOrcamentosForSolicitacao :many
SELECT * FROM orcamentos_fornecedores WHERE solicitacao_compra_id = $1;

-- name: GetOrcamentoFornecedor :one
SELECT * FROM orcamentos_fornecedores WHERE id = $1 LIMIT 1;

-- name: GetOrcamentoFornecedorItens :many
SELECT * FROM orcamentos_fornecedores_itens WHERE orcamento_fornecedor_id = $1;

-- name: MarkOrcamentoComoEscolhido :one
UPDATE orcamentos_fornecedores
SET escolhido = TRUE
WHERE id = $1
RETURNING *;

-- name: CreateBorderop :one
INSERT INTO borderos (
    empresa_id, descricao, status
) VALUES (
    $1, $2, $3
)
RETURNING *;

-- name: GetBorderop :one
SELECT * FROM borderos WHERE id = $1 LIMIT 1;

-- name: ListBorderos :many
SELECT * FROM borderos WHERE empresa_id = $1 ORDER BY criado_em DESC;

-- name: UpdateBorderopStatus :one
UPDATE borderos
SET status = $2
WHERE id = $1
RETURNING *;

-- name: VincularContaAoBorderop :one
UPDATE contas_pagar
SET borderop_id = $2
WHERE id = $1 AND empresa_id = $3
RETURNING *;

-- name: ListContasNoBorderop :many
SELECT * FROM contas_pagar WHERE borderop_id = $1;

-- name: BaixarContasDoBorderop :many
UPDATE contas_pagar
SET status = 'PAGO', data_pagamento = $2
WHERE borderop_id = $1
RETURNING *;

-- name: CreatePcoOrcamento :one
INSERT INTO pco_orcamentos (
    empresa_id, categoria, mes_referencia, limite_orcado, valor_realizado
) VALUES (
    $1, $2, $3, $4, $5
)
ON CONFLICT (empresa_id, categoria, mes_referencia) DO UPDATE
SET limite_orcado = EXCLUDED.limite_orcado
RETURNING *;

-- name: GetPcoOrcamento :one
SELECT * FROM pco_orcamentos 
WHERE empresa_id = $1 AND categoria = $2 AND mes_referencia = $3 
LIMIT 1;

-- name: ListPcoOrcamentos :many
SELECT * FROM pco_orcamentos 
WHERE empresa_id = $1 AND mes_referencia = $2;

-- name: IncrementarRealizadoPCO :one
UPDATE pco_orcamentos
SET valor_realizado = valor_realizado + $4
WHERE empresa_id = $1 AND categoria = $2 AND mes_referencia = $3
RETURNING *;

-- name: SaveBankConfig :one
INSERT INTO configuracoes_banco (
    empresa_id, banco_nome, client_id, client_secret, certificado_digital, token_atual, status
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
)
ON CONFLICT (empresa_id, banco_nome) DO UPDATE
SET client_id = EXCLUDED.client_id,
    client_secret = EXCLUDED.client_secret,
    certificado_digital = EXCLUDED.certificado_digital,
    token_atual = EXCLUDED.token_atual,
    status = EXCLUDED.status
RETURNING *;

-- name: GetBankConfigs :many
SELECT * FROM configuracoes_banco WHERE empresa_id = $1;

-- name: GetBankConfigByBanco :one
SELECT * FROM configuracoes_banco WHERE empresa_id = $1 AND banco_nome = $2 LIMIT 1;

-- name: ListProdutosGradeParaSync :many
SELECT pg.id as produto_grade_id, pg.sku, pg.cor, pg.tamanho, pg.codigo_barras, pg.preco_venda, pg.preco_custo, pg.estoque_atual, pg.estoque_minimo, p.nome as produto_nome, p.descricao as produto_descricao
FROM produtos_grade pg
JOIN produtos p ON pg.produto_id = p.id
WHERE p.empresa_id = $1;

-- name: GetVendaByOfflineUUID :one
SELECT * FROM vendas WHERE offline_uuid = $1 LIMIT 1;

-- name: CreateVenda :one
INSERT INTO vendas (
    empresa_id, total, status, forma_pagamento, chave_nfe, offline_uuid
) VALUES (
    $1, $2, $3, $4, $5, $6
)
RETURNING *;

-- name: CreateVendaItem :one
INSERT INTO venda_itens (
    venda_id, produto_grade_id, quantidade, preco_unitario
) VALUES (
    $1, $2, $3, $4
)
RETURNING *;

-- name: DecrementEstoqueGrade :one
UPDATE produtos_grade
SET estoque_atual = estoque_atual - $2
WHERE id = $1
RETURNING *;

-- name: EnfileirarNotaFiscal :one
INSERT INTO notas_fiscais_fila (
    nota_fiscal_id, status, tentativas
) VALUES (
    $1, $2, $3
)
RETURNING *;

-- name: ListNotasPendentesFila :many
SELECT nff.*, nf.xml_content, nf.tipo, nf.valor_total, nf.empresa_id FROM notas_fiscais_fila nff
JOIN notas_fiscais nf ON nff.nota_fiscal_id = nf.id
WHERE nff.status = 'AGUARDANDO_ENVIO' AND nff.tentativas < 5;

-- name: UpdateFilaStatus :one
UPDATE notas_fiscais_fila
SET status = $2, tentativas = tentativas + 1, erro_log = $3, atualizado_em = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;

-- name: CreateComanda :one
INSERT INTO comandas (
    empresa_id, numero_mesa_comanda, total, status
) VALUES (
    $1, $2, $3, $4
)
RETURNING *;

-- name: GetComanda :one
SELECT * FROM comandas WHERE id = $1 LIMIT 1;

-- name: GetComandaByNumero :one
SELECT * FROM comandas WHERE empresa_id = $1 AND numero_mesa_comanda = $2 AND status = 'ABERTA' LIMIT 1;

-- name: ListComandasAbertas :many
SELECT * FROM comandas WHERE empresa_id = $1 AND status = 'ABERTA';

-- name: CreateComandaItem :one
INSERT INTO comanda_itens (
    comanda_id, produto_grade_id, quantidade, preco_unitario, status_cozinha
) VALUES (
    $1, $2, $3, $4, $5
)
RETURNING *;

-- name: GetComandaItens :many
SELECT ci.*, pg.sku, p.nome as produto_nome FROM comanda_itens ci
JOIN produtos_grade pg ON ci.produto_grade_id = pg.id
JOIN produtos p ON pg.produto_id = p.id
WHERE ci.comanda_id = $1;

-- name: UpdateComandaTotal :one
UPDATE comandas
SET total = $2, atualizado_em = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;

-- name: UpdateComandaStatus :one
UPDATE comandas
SET status = $2, atualizado_em = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;

-- name: UpdateKdsStatusItem :one
UPDATE comanda_itens
SET status_cozinha = $2
WHERE id = $1
RETURNING *;

-- name: ListItensKdsPendentes :many
SELECT ci.*, pg.sku, p.nome as produto_nome, c.numero_mesa_comanda 
FROM comanda_itens ci
JOIN comandas c ON ci.comanda_id = c.id
JOIN produtos_grade pg ON ci.produto_grade_id = pg.id
JOIN produtos p ON pg.produto_id = p.id
WHERE c.empresa_id = $1 AND ci.status_cozinha IN ('PENDENTE', 'EM_PREPARO')
ORDER BY ci.criado_em ASC;

-- name: CreateOrdemServico :one
INSERT INTO ordens_servico (
    empresa_id, cliente_nome, veiculo_equipamento, status, total_pecas, total_mao_obra, total_geral
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
)
RETURNING *;

-- name: GetOrdemServico :one
SELECT * FROM ordens_servico WHERE id = $1 LIMIT 1;

-- name: ListOrdensServico :many
SELECT * FROM ordens_servico WHERE empresa_id = $1 ORDER BY criado_em DESC;

-- name: CreateOSPeca :one
INSERT INTO os_pecas (
    os_id, produto_grade_id, quantidade, preco_unitario
) VALUES (
    $1, $2, $3, $4
)
RETURNING *;

-- name: CreateOSServico :one
INSERT INTO os_servicos (
    os_id, descricao, preco_unitario, quantidade
) VALUES (
    $1, $2, $3, $4
)
RETURNING *;

-- name: GetOSPecas :many
SELECT op.*, pg.sku, p.nome as produto_nome FROM os_pecas op
JOIN produtos_grade pg ON op.produto_grade_id = pg.id
JOIN produtos p ON pg.produto_id = p.id
WHERE op.os_id = $1;

-- name: GetOSServicos :many
SELECT * FROM os_servicos WHERE os_id = $1;

-- name: UpdateOSStatus :one
UPDATE ordens_servico
SET status = $2, total_pecas = $3, total_mao_obra = $4, total_geral = $5, atualizado_em = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;

-- name: CreateSystemAuditLog :one
INSERT INTO logs_auditoria_sistema (
    empresa_id, usuario_id, impersonator_id, acao, detalhes
) VALUES (
    $1, $2, $3, $4, $5
)
RETURNING *;

-- name: ListSystemAuditLogs :many
SELECT las.*, u.nome as usuario_nome, e.razao_social as empresa_nome 
FROM logs_auditoria_sistema las
JOIN usuarios u ON las.usuario_id = u.id
JOIN empresas e ON las.empresa_id = e.id
ORDER BY las.criado_em DESC;

-- name: GetPlatformStats :one
SELECT 
    (SELECT COUNT(*) FROM empresas WHERE status = 'ATIVO')::bigint as total_tenants,
    (SELECT COUNT(*) FROM usuarios)::bigint as total_usuarios,
    (SELECT COUNT(*) FROM vendas)::bigint as total_vendas,
    (SELECT COALESCE(SUM(total), 0.00)::numeric(10,2) FROM vendas)::numeric(10,2) as faturamento_total;

-- name: GetProdutoGradeParaUpdate :one
SELECT * FROM produtos_grade WHERE id = $1 FOR UPDATE;

-- name: UpdateColaboradorFaceTemplate :one
UPDATE colaboradores
SET facial_biometria_template = $2, atualizado_em = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;

-- name: CreatePontoFacial :one
INSERT INTO ponto_registros (
    colaborador_id, tipo, horario, localizacao_gps, foto_hash, facial_similarity
) VALUES (
    $1, $2, $3, $4, $5, $6
)
RETURNING *;

-- name: CreateProductLote :one
INSERT INTO produtos_lotes (
    produto_grade_id, lote_codigo, quantidade, data_validade, data_fabricacao
) VALUES (
    $1, $2, $3, $4, $5
)
RETURNING *;

-- name: ListProductLotesFEFO :many
SELECT * FROM produtos_lotes
WHERE produto_grade_id = $1 AND quantidade > 0
ORDER BY data_validade ASC;

-- name: DecrementProductLoteQuantity :one
UPDATE produtos_lotes
SET quantidade = quantidade - $2
WHERE id = $1
RETURNING *;

-- name: GetClientCashback :one
SELECT * FROM fidelidade_cashback
WHERE empresa_id = $1 AND cliente_cpf = $2;

-- name: CreateOrUpdateCashback :one
INSERT INTO fidelidade_cashback (
    empresa_id, cliente_cpf, saldo_acumulado, atualizado_em
) VALUES (
    $1, $2, $3, CURRENT_TIMESTAMP
)
ON CONFLICT (empresa_id, cliente_cpf)
DO UPDATE SET saldo_acumulado = $3, atualizado_em = CURRENT_TIMESTAMP
RETURNING *;

-- name: CreateDelivery :one
INSERT INTO entregas_delivery (
    venda_id, endereco_entrega, cep, bairro, status_entrega, rota_ordem
) VALUES (
    $1, $2, $3, $4, $5, $6
)
RETURNING *;

-- name: ListDeliveries :many
SELECT ed.*, v.total as venda_total 
FROM entregas_delivery ed
JOIN vendas v ON ed.venda_id = v.id
WHERE v.empresa_id = $1
ORDER BY ed.criado_em DESC;

-- name: CreateContratoRecorrente :one
INSERT INTO contratos_recorrentes (
    empresa_id, cliente_nome, cliente_email, cliente_cpf, descricao, valor_mensal, status, dia_vencimento
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
)
RETURNING *;

-- name: ListContratosRecorrentes :many
SELECT * FROM contratos_recorrentes
WHERE empresa_id = $1
ORDER BY criado_em DESC;

-- name: CreateMarketplaceIntegration :one
INSERT INTO marketplace_integracoes (
    empresa_id, plataforma, status
) VALUES (
    $1, $2, $3
)
RETURNING *;

-- name: ListMarketplaceIntegrations :many
SELECT * FROM marketplace_integracoes
WHERE empresa_id = $1
ORDER BY criado_em DESC;
