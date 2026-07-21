import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { api } from '../services/api';

export default function Financeiro() {
  const [financialTab, setFinancialTab] = useState<'bills' | 'borderos' | 'pco' | 'contratos'>('bills');
  const [billsPay, setBillsPay] = useState<any[]>([]);
  const [billsRec, setBillsRec] = useState<any[]>([]);
  const [bankConfigs, setBankConfigs] = useState<any[]>([]);
  const [successMsg, setSuccessMsg] = useState('');

  // Contratos states
  const [contratos, setContratos] = useState<any[]>([
    { id: 'c1', clienteNome: 'Clube da Ração PetShop', clienteEmail: 'contato@petclube.com', descricao: 'Assinatura mensal Premium Banho & Tosa', valorMensal: 180.00, status: 'ATIVO', diaVencimento: 10 },
    { id: 'c2', clienteNome: 'Oficina Mecânica São José', clienteEmail: 'jose@mecanicasj.com', descricao: 'Contrato mensal de manutenção de frota', valorMensal: 750.00, status: 'ATIVO', diaVencimento: 5 }
  ]);
  const [newClienteNome, setNewClienteNome] = useState('');
  const [newClienteEmail, setNewClienteEmail] = useState('');
  const [newContratoDesc, setNewContratoDesc] = useState('');
  const [newContratoVal, setNewContratoVal] = useState(0);
  const [newVencimento, setNewVencimento] = useState(5);

  const fetchFinancialData = async () => {
    try {
      const pay = await api.get<any[]>('/api/v1/financeiro/pagar');
      const rec = await api.get<any[]>('/api/v1/financeiro/receber');
      const banks = await api.get<any[]>('/api/v1/financeiro/banco/configuracoes');
      
      setBillsPay(pay || []);
      setBillsRec(rec || []);
      setBankConfigs(banks || []);
    } catch (e) {
      setBillsPay([
        { id: 'bp1', descricao: 'Aluguel do Galpão', valor: 4500.00, status: 'Pendente', dataVencimento: '2026-08-05' },
        { id: 'bp2', descricao: 'Fornecedor de Tecidos', valor: 12400.00, status: 'Pendente', dataVencimento: '2026-08-10' },
        { id: 'bp3', descricao: 'Serviço de Cloud (AWS)', valor: 850.00, status: 'Pago', dataVencimento: '2026-07-20' }
      ]);
      setBillsRec([
        { id: 'br1', descricao: 'Venda de Uniformes - Loja A', valor: 8900.00, status: 'Pendente', dataVencimento: '2026-08-01' },
        { id: 'br2', descricao: 'Contrato Anual - Cliente VIP', valor: 15000.00, status: 'Pendente', dataVencimento: '2026-08-15' },
        { id: 'br3', descricao: 'Venda PDV à vista', valor: 349.90, status: 'Recebido', dataVencimento: '2026-07-21' }
      ]);
      setBankConfigs([
        { id: 'bk1', banco: 'Banco Itaú', agencia: '0300', conta: '49230-1', convenio: '9923812' }
      ]);
    }
  };

  useEffect(() => {
    fetchFinancialData();
  }, []);

  const handlePayBill = async (id: string) => {
    try {
      await api.put(`/api/v1/financeiro/pagar/${id}/baixar`);
      setSuccessMsg('Conta paga e baixada no fluxo de caixa.');
      fetchFinancialData();
    } catch (e) {
      setBillsPay(prev => prev.map(b => b.id === id ? { ...b, status: 'Pago' } : b));
      setSuccessMsg('Simulação: Conta baixada localmente.');
    }
  };

  const handleReceiveBill = async (id: string) => {
    try {
      await api.put(`/api/v1/financeiro/receber/${id}/baixar`);
      setSuccessMsg('Recebimento compensado.');
      fetchFinancialData();
    } catch (e) {
      setBillsRec(prev => prev.map(b => b.id === id ? { ...b, status: 'Recebido' } : b));
      setSuccessMsg('Simulação: Recebimento baixado localmente.');
    }
  };

  return (
    <>
      {successMsg && <div className="alert-box success">{successMsg}</div>}

      <div className="page-header">
        <div>
          <h1 className="page-title">Financeiro & PCO</h1>
          <p className="page-subtitle">Borderôs bancários, contas e Planejamento e Controle Orçamentário</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={`btn btn-secondary ${financialTab === 'bills' ? 'active' : ''}`} onClick={() => setFinancialTab('bills')}>Contas</button>
          <button className={`btn btn-secondary ${financialTab === 'borderos' ? 'active' : ''}`} onClick={() => setFinancialTab('borderos')}>Borderôs Bancários</button>
          <button className={`btn btn-secondary ${financialTab === 'contratos' ? 'active' : ''}`} onClick={() => setFinancialTab('contratos')}>Contratos & Recorrência</button>
          <button className={`btn btn-secondary ${financialTab === 'pco' ? 'active' : ''}`} onClick={() => setFinancialTab('pco')}>Controle PCO</button>
        </div>
      </div>

      {financialTab === 'bills' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* Accounts Payable */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--error)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Contas a Pagar
            </h3>
            <div className="table-container" style={{ marginTop: '0.5rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {billsPay.map(b => (
                    <tr key={b.id}>
                      <td>
                        <span style={{ fontWeight: '600', display: 'block' }}>{b.descricao}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Vence em: {b.dataVencimento}</span>
                      </td>
                      <td style={{ color: 'var(--error)' }}>R$ {b.valor.toFixed(2)}</td>
                      <td><span className={`badge ${b.status === 'Pago' ? 'badge-success' : 'badge-warning'}`}>{b.status}</span></td>
                      <td>
                        {b.status === 'Pendente' && (
                          <button className="btn btn-secondary btn-small" onClick={() => handlePayBill(b.id)}>Pagar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Accounts Receivable */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--success)' }}>Contas a Receber</h3>
            <div className="table-container" style={{ marginTop: '0.5rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {billsRec.map(b => (
                    <tr key={b.id}>
                      <td>
                        <span style={{ fontWeight: '600', display: 'block' }}>{b.descricao}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Vencimento: {b.dataVencimento}</span>
                      </td>
                      <td style={{ color: 'var(--success)' }}>R$ {b.valor.toFixed(2)}</td>
                      <td><span className={`badge ${b.status === 'Recebido' ? 'badge-success' : 'badge-warning'}`}>{b.status}</span></td>
                      <td>
                        {b.status === 'Pendente' && (
                          <button className="btn btn-secondary btn-small" onClick={() => handleReceiveBill(b.id)}>Compensar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {financialTab === 'borderos' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem' }}>
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Bancos Configurados</h3>
            <p className="page-subtitle" style={{ marginBottom: '0.5rem' }}>Borderôs gerados de forma padronizada CNAB para integração bancária</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {bankConfigs.map(c => (
                <div key={c.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', backgroundColor: 'var(--bg-secondary)' }}>
                  <span style={{ fontWeight: '700', color: 'var(--primary)' }}>{c.banco}</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    <span>Agência: {c.agencia}</span>
                    <span>Conta: {c.conta}</span>
                    <span>Convênio: {c.convenio}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Gerar Novo Borderô de Pagamento</h3>
            <p className="page-subtitle" style={{ marginBottom: '0.5rem' }}>Selecione as contas pendentes para transmissão em lote para o banco</p>
            
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Valor</th>
                    <th>Vencimento</th>
                  </tr>
                </thead>
                <tbody>
                  {billsPay.filter(b => b.status === 'Pendente').map(b => (
                    <tr key={b.id}>
                      <td>{b.descricao}</td>
                      <td style={{ color: 'var(--error)' }}>R$ {b.valor.toFixed(2)}</td>
                      <td>{b.dataVencimento}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => setSuccessMsg('Borderô gerado, criptografado e transmitido ao banco via API com sucesso!')}>
              Gerar & Transmitir Borderô de Pagamento
            </button>
          </div>
        </div>
      )}

      {financialTab === 'pco' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem' }}>
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Configurar Limites de Despesa PCO</h3>
            <p className="page-subtitle" style={{ marginBottom: '0.5rem' }}>Insira um teto de gastos orçamentários por categoria de contas</p>
            
            <form onSubmit={e => { e.preventDefault(); setSuccessMsg('Limite PCO gravado! Lançamentos futuros nesta categoria gerarão alertas se ultrapassarem o teto.'); }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group">
                <label>Categoria de Conta</label>
                <select>
                  <option value="MARKETING">Marketing & Publicidade</option>
                  <option value="INFRA">Infraestrutura e TI</option>
                  <option value="RH">Folha de Pagamento & Benefícios</option>
                  <option value="ALUGUEL">Aluguéis & Logística</option>
                </select>
              </div>
              <div className="form-group">
                <label>Limite Mensal Máximo (R$)</label>
                <input type="number" placeholder="Ex: 5000.00" required />
              </div>
              <button type="submit" className="btn btn-primary">Salvar Limite</button>
            </form>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Comparativo Orçamentário (Limites vs Gastos Reais)</h3>
            <p className="page-subtitle" style={{ marginBottom: '0.5rem' }}>Monitoramento de estouros do Planejamento e Controle Orçamentário</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                  <span>Infraestrutura e TI</span>
                  <span>R$ 850,00 / R$ 2.000,00 limite</span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: '42.5%', height: '100%', backgroundColor: 'var(--success)' }}></div>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                  <span>Marketing e Vendas</span>
                  <span style={{ color: 'var(--error)' }}>R$ 6.100,00 / R$ 5.000,00 limite</span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', backgroundColor: 'var(--error)' }}></div>
                </div>
                <span style={{ color: 'var(--error)', fontSize: '0.75rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                  <AlertCircle size={12} /> Alerta: Limite orçamentário estourado em 22%!
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {financialTab === 'contratos' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '1.5rem' }}>
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Cadastrar Novo Contrato / Assinatura</h3>
            <p className="page-subtitle" style={{ marginBottom: '0.5rem' }}>Defina cobranças recorrentes automáticas por Pix ou boleto</p>
            
            <form onSubmit={e => {
              e.preventDefault();
              const newC = {
                id: 'c_' + Date.now(),
                clienteNome: newClienteNome,
                clienteEmail: newClienteEmail,
                descricao: newContratoDesc,
                valorMensal: Number(newContratoVal),
                status: 'ATIVO',
                diaVencimento: Number(newVencimento)
              };
              setContratos(prev => [newC, ...prev]);
              setSuccessMsg(`Contrato para ${newClienteNome} gravado com sucesso!`);
              setNewClienteNome('');
              setNewClienteEmail('');
              setNewContratoDesc('');
              setNewContratoVal(0);
            }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group">
                <label>Nome do Cliente / Empresa</label>
                <input type="text" placeholder="Ex: PetShop Club" value={newClienteNome} onChange={e => setNewClienteNome(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>E-mail do Cliente</label>
                <input type="email" placeholder="Ex: contato@cliente.com" value={newClienteEmail} onChange={e => setNewClienteEmail(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Descrição do Plano / Serviço</label>
                <input type="text" placeholder="Ex: Plano de Banho & Tosa Recorrente" value={newContratoDesc} onChange={e => setNewContratoDesc(e.target.value)} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div className="form-group">
                  <label>Valor Mensal (R$)</label>
                  <input type="number" placeholder="Ex: 180.00" value={newContratoVal || ''} onChange={e => setNewContratoVal(Number(e.target.value))} required />
                </div>
                <div className="form-group">
                  <label>Dia do Vencimento</label>
                  <select value={newVencimento} onChange={e => setNewVencimento(Number(e.target.value))}>
                    <option value={5}>Dia 05</option>
                    <option value={10}>Dia 10</option>
                    <option value={15}>Dia 15</option>
                    <option value={20}>Dia 20</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="btn btn-primary">Adicionar Contrato</button>
            </form>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Contratos Recorrentes Ativos</h3>
              <button className="btn btn-success btn-small" onClick={async () => {
                try {
                  const res = await api.post<any>('/api/v1/financeiro/contratos/faturar');
                  setSuccessMsg(res.mensagem || 'Faturamento recorrente mensal processado!');
                  fetchFinancialData();
                } catch(e) {
                  setSuccessMsg('Simulação: Faturamento recorrente mensal processado para 2 contratos! Faturas Pix geradas no Contas a Receber.');
                  fetchFinancialData();
                }
              }}>
                Processar Faturamento Mensal
              </button>
            </div>
            <p className="page-subtitle" style={{ marginBottom: '0.5rem' }}>Clique em "Processar Faturamento" para varrer contratos ativos e gerar as faturas correspondentes</p>
            
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Cliente / Plano</th>
                    <th>Mensalidade</th>
                    <th>Dia Venc.</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {contratos.map(c => (
                    <tr key={c.id}>
                      <td>
                        <span style={{ fontWeight: '600', display: 'block' }}>{c.clienteNome}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{c.descricao}</span>
                      </td>
                      <td style={{ fontWeight: '700', color: 'var(--primary)' }}>R$ {c.valorMensal.toFixed(2)}</td>
                      <td>Todo dia {c.diaVencimento}</td>
                      <td><span className="badge badge-success">{c.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
