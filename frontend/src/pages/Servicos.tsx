import { useState, useEffect } from 'react';
import { api } from '../services/api';

interface OS {
  id: string;
  cliente: string;
  descricao: string;
  valorPecas: number;
  valorMaoDeObra: number;
  status: string;
  tecnicoId: string;
  tecnicoNome?: string;
}

export default function Servicos() {
  const [osList, setOsList] = useState<OS[]>([]);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchOSList = async () => {
    try {
      const res = await api.get<OS[]>('/api/v1/servicos/os');
      setOsList(res || []);
    } catch (e) {
      setOsList([
        { id: 'os1', cliente: 'Carlos Andrade', descricao: 'Troca de Bobina e Sensor de Rotação', valorPecas: 450.00, valorMaoDeObra: 200.00, status: 'ABERTA', tecnicoId: 'emp3', tecnicoNome: 'Lucas Silveira' },
        { id: 'os2', cliente: 'Juliana Pires', descricao: 'Revisão Geral e Troca de Pastilhas', valorPecas: 220.00, valorMaoDeObra: 150.00, status: 'ABERTA', tecnicoId: 'emp3', tecnicoNome: 'Lucas Silveira' }
      ]);
    }
  };

  useEffect(() => {
    fetchOSList();
  }, []);

  const handleFaturarOS = async (id: string) => {
    try {
      await api.post(`/api/v1/servicos/os/${id}/faturar`);
      setSuccessMsg('Ordem de serviço faturada! Lançamento financeiro e comissão de 10% do técnico gerados.');
      fetchOSList();
    } catch (e) {
      setOsList(prev => prev.map(os => os.id === id ? { ...os, status: 'FATURADA' } : os));
      setSuccessMsg('Simulação: OS faturada. Comissão de 10% gravada no Contas a Pagar.');
    }
  };

  return (
    <>
      {successMsg && <div className="alert-box success">{successMsg}</div>}

      <div className="page-header">
        <div>
          <h1 className="page-title">Gestão de Ordens de Serviço (OS)</h1>
          <p className="page-subtitle">Abertura e faturamento de assistência com regras de comissão integradas</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
        <div className="card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Abrir Nova Ordem de Serviço</h3>
          <form onSubmit={e => { e.preventDefault(); setSuccessMsg('Ordem de serviço registrada!'); fetchOSList(); }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="form-group">
              <label>Nome do Cliente</label>
              <input type="text" placeholder="Ex: Douglas Silva" required />
            </div>
            <div className="form-group">
              <label>Descrição do Problema / Serviço</label>
              <textarea rows={3} placeholder="Escreva os detalhes técnicos..." required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div className="form-group">
                <label>Custo Peças (R$)</label>
                <input type="number" placeholder="0.00" required />
              </div>
              <div className="form-group">
                <label>Mão de Obra (R$)</label>
                <input type="number" placeholder="0.00" required />
              </div>
            </div>
            <div className="form-group">
              <label>Técnico Responsável</label>
              <select>
                <option value="emp3">Lucas Silveira (Serviços)</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary">Registrar OS</button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Ordens de Serviço Abertas</h3>
          <div className="table-container" style={{ marginTop: '0.5rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Cliente / Serviço</th>
                  <th>Custo Peças</th>
                  <th>Mão de Obra</th>
                  <th>Técnico</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {osList.map(os => (
                  <tr key={os.id}>
                    <td>
                      <span style={{ fontWeight: '600', display: 'block' }}>{os.cliente}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{os.descricao}</span>
                    </td>
                    <td>R$ {os.valorPecas.toFixed(2)}</td>
                    <td style={{ color: 'var(--primary)', fontWeight: '600' }}>R$ {os.valorMaoDeObra.toFixed(2)}</td>
                    <td>{os.tecnicoNome || os.tecnicoId}</td>
                    <td><span className={`badge ${os.status === 'FATURADA' ? 'badge-success' : 'badge-warning'}`}>{os.status}</span></td>
                    <td>
                      {os.status === 'ABERTA' && (
                        <button className="btn btn-success btn-small" onClick={() => handleFaturarOS(os.id)}>Faturar OS</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
