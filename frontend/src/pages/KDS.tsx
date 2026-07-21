import { useState, useEffect, useRef } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

interface KdsItem {
  id: string;
  comandaId: string;
  nome: string;
  quantidade: number;
  status: string; // "RECEBIDO", "PREPARANDO", "PRONTO"
  tempoPreparoMinutos: number;
}

export default function KDS() {
  const [kdsItems, setKdsItems] = useState<KdsItem[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  const fetchKDSItems = async () => {
    try {
      const res = await api.get<KdsItem[]>('/api/v1/kds/itens');
      setKdsItems(res || []);
    } catch (e) {
      setKdsItems([
        { id: 'k1', comandaId: 'Comanda #102', nome: 'Hambúrguer Gourmet + Fritas', quantidade: 1, status: 'RECEBIDO', tempoPreparoMinutos: 4 },
        { id: 'k2', comandaId: 'Comanda #102', nome: 'Milkshake Ovomaltine', quantidade: 1, status: 'RECEBIDO', tempoPreparoMinutos: 3 },
        { id: 'k3', comandaId: 'Comanda #100', nome: 'Pizza Margherita', quantidade: 1, status: 'PREPARANDO', tempoPreparoMinutos: 17 },
        { id: 'k4', comandaId: 'Comanda #099', nome: 'Pastel de Carne com Queijo', quantidade: 2, status: 'PRONTO', tempoPreparoMinutos: 11 }
      ]);
    }
  };

  const connectKDSWebSocket = () => {
    try {
      const ws = new WebSocket('ws://localhost:8080/ws/kds');
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        console.log('[KDS WS] Conectado.');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[KDS WS] Mensagem recebida:', data);
          fetchKDSItems();
        } catch (e) {
          console.warn('[KDS WS] Erro ao parsear mensagem:', e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        console.log('[KDS WS] Desconectado.');
        setTimeout(() => {
          connectKDSWebSocket();
        }, 3000);
      };
    } catch (err) {
      console.error('[KDS WS] Erro ao conectar:', err);
    }
  };

  useEffect(() => {
    fetchKDSItems();
    connectKDSWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const handleProgressKDS = async (itemId: string, currentStatus: string) => {
    let nextStatus = 'PREPARANDO';
    if (currentStatus === 'RECEBIDO') nextStatus = 'PREPARANDO';
    else if (currentStatus === 'PREPARANDO') nextStatus = 'PRONTO';
    else nextStatus = 'ENTREGUE';

    try {
      await api.put(`/api/v1/kds/itens/${itemId}`, { status: nextStatus });
      fetchKDSItems();
    } catch (e) {
      setKdsItems(prev => 
        prev.map(item => item.id === itemId ? { ...item, status: nextStatus } : item)
            .filter(item => item.status !== 'ENTREGUE')
      );
      setSuccessMsg(`Status do item alterado para ${nextStatus}`);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  };

  return (
    <>
      {successMsg && <div className="alert-box success">{successMsg}</div>}

      <div className="page-header">
        <div>
          <h1 className="page-title">KDS (Kitchen Display System)</h1>
          <p className="page-subtitle">Acompanhamento e preparação de pedidos de cozinha em tempo real</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className={`badge ${wsConnected ? 'badge-success' : 'badge-error'}`} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            {wsConnected ? <Wifi size={14} /> : <WifiOff size={14} />} {wsConnected ? 'WebSocket Ativo' : 'Erro de Conexão'}
          </span>
          <button className="btn btn-secondary btn-small" onClick={fetchKDSItems}><RefreshCw size={14} /></button>
        </div>
      </div>

      <div className="kds-board">
        {/* Column 1: A Preparar (Status RECEBIDO) */}
        <div className="kds-column">
          <div className="kds-column-header">
            <span>A Preparar</span>
            <span className="badge badge-info">{kdsItems.filter(i => i.status === 'RECEBIDO').length}</span>
          </div>
          {kdsItems.filter(i => i.status === 'RECEBIDO').map(item => (
            <div className="kds-card" key={item.id}>
              <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', fontWeight: '700' }}>
                <span>{item.comandaId}</span>
                <span style={{ color: 'var(--text-muted)' }}>{item.tempoPreparoMinutos}m atrás</span>
              </div>
              <div className="kds-item-row">
                <span>{item.quantidade}x {item.nome}</span>
              </div>
              <button className="btn btn-primary btn-small" style={{ marginTop: '0.5rem' }} onClick={() => handleProgressKDS(item.id, 'RECEBIDO')}>Começar Preparo</button>
            </div>
          ))}
        </div>

        {/* Column 2: Preparando (Status PREPARANDO) */}
        <div className="kds-column">
          <div className="kds-column-header" style={{ color: 'var(--warning)' }}>
            <span>Em Preparação</span>
            <span className="badge badge-warning">{kdsItems.filter(i => i.status === 'PREPARANDO').length}</span>
          </div>
          {kdsItems.filter(i => i.status === 'PREPARANDO').map(item => {
            const delayed = item.tempoPreparoMinutos > 15;
            return (
              <div className={`kds-card ${delayed ? 'delayed' : ''}`} key={item.id}>
                <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', fontWeight: '700' }}>
                  <span>{item.comandaId}</span>
                  <span style={{ color: delayed ? 'var(--error)' : 'var(--warning)' }}>
                    {item.tempoPreparoMinutos}m no fogo {delayed && '(Atrasado!)'}
                  </span>
                </div>
                <div className="kds-item-row">
                  <span>{item.quantidade}x {item.nome}</span>
                </div>
                <button className="btn btn-success btn-small" style={{ marginTop: '0.5rem' }} onClick={() => handleProgressKDS(item.id, 'PREPARANDO')}>Finalizar (Pronto)</button>
              </div>
            );
          })}
        </div>

        {/* Column 3: Pronto (Status PRONTO) */}
        <div className="kds-column">
          <div className="kds-column-header" style={{ color: 'var(--success)' }}>
            <span>Finalizados</span>
            <span className="badge badge-success">{kdsItems.filter(i => i.status === 'PRONTO').length}</span>
          </div>
          {kdsItems.filter(i => i.status === 'PRONTO').map(item => (
            <div className="kds-card" style={{ borderLeft: '4px solid var(--success)' }} key={item.id}>
              <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', fontWeight: '700' }}>
                <span>{item.comandaId}</span>
                <span style={{ color: 'var(--success)' }}>Pronto</span>
              </div>
              <div className="kds-item-row">
                <span>{item.quantidade}x {item.nome}</span>
              </div>
              <button className="btn btn-secondary btn-small" style={{ marginTop: '0.5rem' }} onClick={() => handleProgressKDS(item.id, 'PRONTO')}>Entregar Pedido</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
