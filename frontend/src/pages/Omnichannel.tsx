import { useState, useEffect } from 'react';
import { ShoppingBag, Layers } from 'lucide-react';
import { api } from '../services/api';

interface Marketplace {
  plataforma: string;
  status: string;
}

export default function Omnichannel() {
  const [channels, setChannels] = useState<Marketplace[]>([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [syncLogs, setSyncLogs] = useState<string[]>([
    'Omnichannel inicializado. Monitorando eventos de estoque local...',
  ]);

  const fetchChannels = async () => {
    try {
      const res = await api.get<Marketplace[]>('/api/v1/estoque/omnichannel/config');
      setChannels(res || []);
    } catch (e) {
      setChannels([
        { plataforma: 'SHOPEE', status: 'CONECTADO' },
        { plataforma: 'MERCADO_LIVRE', status: 'DESCONECTADO' },
        { plataforma: 'LOJA_INTEGRADA', status: 'CONECTADO' }
      ]);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const handleToggleChannel = async (plataforma: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'CONECTADO' ? 'DESCONECTADO' : 'CONECTADO';
    try {
      await api.post('/api/v1/estoque/omnichannel/config', { plataforma, status: nextStatus });
      setChannels(prev => prev.map(c => c.plataforma === plataforma ? { ...c, status: nextStatus } : c));
      setSuccessMsg(`Status do canal ${plataforma} alterado para ${nextStatus}.`);
    } catch (e) {
      setChannels(prev => prev.map(c => c.plataforma === plataforma ? { ...c, status: nextStatus } : c));
      setSuccessMsg(`Simulação: Canal ${plataforma} alterado para ${nextStatus}.`);
    }
  };

  const handleSimulateSaleSync = () => {
    const timestamp = new Date().toLocaleTimeString();
    setSyncLogs(prev => [
      `[${timestamp}] Venda efetuada no PDV Balcão - Camiseta Dry-Fit (-1 un)`,
      `[${timestamp}] Emitindo atualização de estoque para Shopee... ✔ Sincronizado.`,
      `[${timestamp}] Emitindo atualização de estoque para Loja Integrada... ✔ Sincronizado.`,
      ...prev
    ]);
    setSuccessMsg('Simulação de sincronização Omnichannel em tempo real concluída!');
  };

  return (
    <>
      {successMsg && <div className="alert-box success">{successMsg}</div>}

      <div className="page-header">
        <div>
          <h1 className="page-title">Omnichannel & Marketplaces</h1>
          <p className="page-subtitle">Sincronização bidirecional de estoque físico com vitrines e lojas virtuais</p>
        </div>
        <button className="btn btn-primary" onClick={handleSimulateSaleSync}>
          Simular Venda no PDV & Sincronizar Canais
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem' }}>
        <div className="card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Canais de Venda Ativos</h3>
          <p className="page-subtitle" style={{ marginBottom: '0.75rem' }}>Conecte e gerencie credenciais de APIs dos e-commerces</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {channels.map((c) => (
              <div key={c.plataforma} style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1rem', backgroundColor: 'var(--bg-secondary)', display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className="card-icon-container primary" style={{ width: '40px', height: '40px' }}><ShoppingBag size={20} /></div>
                  <div>
                    <span style={{ fontWeight: '700', fontSize: '1rem', display: 'block' }}>{c.plataforma}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Sincronização de Estoque Ativa</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className={`badge ${c.status === 'CONECTADO' ? 'badge-success' : 'badge-error'}`}>{c.status}</span>
                  <button className="btn btn-secondary btn-small" onClick={() => handleToggleChannel(c.plataforma, c.status)}>
                    {c.status === 'CONECTADO' ? 'Desconectar' : 'Conectar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={18} /> Logs de Transmissão Omnichannel
          </h3>
          <p className="page-subtitle" style={{ marginBottom: '0.5rem' }}>Fila de atualização de estoque disparada por webhook</p>
          
          <div style={{ padding: '1rem', background: '#090d16', borderRadius: '8px', border: '1px solid var(--border-color)', height: '240px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {syncLogs.map((log, idx) => (
              <div key={idx} style={{ marginBottom: '0.4rem', borderBottom: '1px solid #141f35', paddingBottom: '0.25rem' }}>{log}</div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
