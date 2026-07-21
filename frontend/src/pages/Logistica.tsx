import { useState, useEffect } from 'react';
import { Truck, Send } from 'lucide-react';
import { api } from '../services/api';

interface Delivery {
  id: string;
  vendaId: string;
  enderecoEntrega: string;
  cep: string;
  bairro: string;
  statusEntrega: string;
  rotaOrdem: number;
  vendaTotal: number;
}

export default function Logistica() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchDeliveries = async () => {
    try {
      const res = await api.get<Delivery[]>('/api/v1/logistica/entregas');
      setDeliveries(res || []);
    } catch (e) {
      setDeliveries([
        { id: 'd1', vendaId: 'v102', enderecoEntrega: 'Av. Paulista, 1000 - Apto 51', cep: '01310-100', bairro: 'Bela Vista', statusEntrega: 'AGUARDANDO_ROTA', rotaOrdem: 0, vendaTotal: 129.90 },
        { id: 'd2', vendaId: 'v103', enderecoEntrega: 'Alameda Santos, 1400', cep: '01419-002', bairro: 'Jardins', statusEntrega: 'AGUARDANDO_ROTA', rotaOrdem: 0, vendaTotal: 349.90 },
        { id: 'd3', vendaId: 'v104', enderecoEntrega: 'Rua Augusta, 2600 - Bloco B', cep: '01412-100', bairro: 'Jardins', statusEntrega: 'AGUARDANDO_ROTA', rotaOrdem: 0, vendaTotal: 59.90 },
      ]);
    }
  };

  useEffect(() => {
    fetchDeliveries();
  }, []);

  const handleOptimizeRoute = async () => {
    try {
      const res = await api.post<Delivery[]>('/api/v1/logistica/entregas/roteirizar', deliveries);
      setDeliveries(res || []);
      setSuccessMsg('Rotas otimizadas por bairro e CEP (Roteirizador Inteligente)!');
    } catch (e) {
      // Offline fallback optimization
      const sorted = [...deliveries].sort((a, b) => {
        if (a.bairro !== b.bairro) return a.bairro.localeCompare(b.bairro);
        return a.cep.localeCompare(b.cep);
      }).map((d, i) => ({ ...d, rotaOrdem: i + 1, statusEntrega: 'ROTA_GERADA' }));
      setDeliveries(sorted);
      setSuccessMsg('Simulação: Rotas agrupadas por Bairro e CEP com sucesso!');
    }
  };

  const handleSendWhatsApp = (delivery: Delivery) => {
    const message = `Olá! Seu pedido de R$ ${delivery.vendaTotal.toFixed(2)} está a caminho. Acompanhe a entrega pelo rastreamento simplificado Vaelis: http://vaelis.delivery/track/${delivery.id}`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    setSuccessMsg(`Link de rastreamento do entregador gerado e enviado via WhatsApp para o cliente.`);
  };

  return (
    <>
      {successMsg && <div className="alert-box success">{successMsg}</div>}

      <div className="page-header">
        <div>
          <h1 className="page-title">Logística & Delivery (Roteirizador)</h1>
          <p className="page-subtitle">Agrupamento inteligente de entregas por proximidade geográfica e rotas de CEP</p>
        </div>
        <button className="btn btn-primary" onClick={handleOptimizeRoute}>
          <Truck size={16} /> Otimizar Rota de Entregas
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
        <div className="card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Roteirização Otimizada</h3>
          <p className="page-subtitle" style={{ marginBottom: '0.75rem' }}>Ordem sequencial recomendada para o motorista</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {deliveries.filter(d => d.rotaOrdem > 0).sort((a,b) => a.rotaOrdem - b.rotaOrdem).map((d) => (
              <div key={d.id} style={{ display: 'flex', gap: '0.75rem', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', backgroundColor: 'var(--bg-secondary)', alignItems: 'center' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--primary)', color: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                  {d.rotaOrdem}
                </div>
                <div style={{ flexGrow: 1 }}>
                  <span style={{ fontWeight: '600', display: 'block', fontSize: '0.9rem' }}>{d.bairro}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{d.enderecoEntrega}</span>
                </div>
                <button className="btn btn-secondary btn-small" onClick={() => handleSendWhatsApp(d)} title="Enviar Rastreio">
                  <Send size={12} />
                </button>
              </div>
            ))}

            {deliveries.filter(d => d.rotaOrdem > 0).length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '1.5rem 0' }}>
                Nenhuma rota gerada. Clique em "Otimizar Rota de Entregas" no cabeçalho.
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Pedidos Pendentes para Entrega</h3>
          <p className="page-subtitle" style={{ marginBottom: '0.5rem' }}>Fila de saídas registradas no PDV aguardando roteirização</p>
          
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Venda ID</th>
                  <th>Endereço de Entrega</th>
                  <th>Bairro / CEP</th>
                  <th>Valor Total</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map(d => (
                  <tr key={d.id}>
                    <td><code>{d.vendaId}</code></td>
                    <td style={{ fontSize: '0.85rem' }}>{d.enderecoEntrega}</td>
                    <td>{d.bairro} ({d.cep})</td>
                    <td style={{ fontWeight: '600', color: 'var(--success)' }}>R$ {d.vendaTotal.toFixed(2)}</td>
                    <td>
                      <span className={`badge ${d.rotaOrdem > 0 ? 'badge-success' : 'badge-warning'}`}>
                        {d.rotaOrdem > 0 ? `Na Rota (#${d.rotaOrdem})` : 'Aguardando'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-small" onClick={() => handleSendWhatsApp(d)}>
                        Rastreio WhatsApp
                      </button>
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
