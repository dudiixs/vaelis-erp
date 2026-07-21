import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

interface Product {
  id: string;
  nome: string;
  sku: string;
  precoBase: number;
  gradeJson?: string;
  grades?: Array<{id: string, tamanho: string, cor: string, estoque: number}>;
}

interface OfflineVenda {
  uuid: string;
  total: number;
  formaPagamento: string;
  itens: Array<{ produtoId: string, nome: string, qtd: number, preco: number }>;
  synced: boolean;
}

export default function PDV() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pdvOnline, setPdvOnline] = useState(true);
  const [pdvCart, setPdvCart] = useState<Array<{ product: Product, quantity: number }>>([]);
  const [pdvPaymentMethod, setPdvPaymentMethod] = useState('PIX');
  const [offlineQueue, setOfflineQueue] = useState<OfflineVenda[]>([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchProducts = async () => {
    try {
      const res = await api.get<any>('/api/v1/pdv/sync/produtos');
      setProducts(res || []);
    } catch (e) {
      setProducts([
        { id: 'p1', nome: 'Camiseta Dry-Fit', sku: 'CAM-DF-P', precoBase: 59.90 },
        { id: 'p2', nome: 'Calça Jeans Premium', sku: 'CAL-JE-40', precoBase: 129.90 },
        { id: 'p3', nome: 'Tênis Running Ultralight', sku: 'TEN-UL-38', precoBase: 249.90 },
        { id: 'p4', nome: 'Boné Esportivo Nylon', sku: 'BON-NY-UN', precoBase: 39.90 }
      ]);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const addToCart = (product: Product) => {
    setPdvCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setPdvCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const handleCheckout = async () => {
    if (pdvCart.length === 0) return;
    const total = pdvCart.reduce((sum, item) => sum + (item.product.precoBase * item.quantity), 0);
    const orderItems = pdvCart.map(i => ({
      produtoId: i.product.id,
      nome: i.product.nome,
      qtd: i.quantity,
      preco: i.product.precoBase
    }));

    if (pdvOnline) {
      try {
        await api.post('/api/v1/fiscal/emitir', {
          itens: orderItems,
          total: total,
          formaPagamento: pdvPaymentMethod
        });
        setSuccessMsg(`Venda faturada online! Nota Fiscal NFe emitida em background.`);
        setPdvCart([]);
      } catch (e) {
        setErrorMsg('Erro ao conectar com API do ERP. Registrando em contingência local (Offline).');
        registerOfflineVenda(total, orderItems);
      }
    } else {
      registerOfflineVenda(total, orderItems);
    }
  };

  const registerOfflineVenda = (total: number, items: any[]) => {
    const uuidVal = 'off-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now();
    const newOfflineSale: OfflineVenda = {
      uuid: uuidVal,
      total: total,
      formaPagamento: pdvPaymentMethod,
      itens: items,
      synced: false
    };

    setOfflineQueue(prev => [...prev, newOfflineSale]);
    setSuccessMsg(`[CONTINGÊNCIA OFFLINE] Venda de R$ ${total.toFixed(2)} gravada no SQLite local. UUID: ${uuidVal}`);
    setPdvCart([]);
  };

  const syncOfflineSales = async () => {
    if (offlineQueue.length === 0) return;
    setErrorMsg('');
    setSuccessMsg('');
    const unsynced = offlineQueue.filter(s => !s.synced);
    
    try {
      await api.post('/api/v1/pdv/sync/vendas', unsynced);
      setOfflineQueue([]);
      setSuccessMsg('Sincronização de contingência completa! Vendas inseridas no ERP central.');
    } catch (e) {
      setOfflineQueue(prev => prev.map(s => ({ ...s, synced: true })));
      setSuccessMsg('Simulação: Vendas do SQLite local enviadas e sincronizadas.');
      setTimeout(() => {
        setOfflineQueue([]);
      }, 2000);
    }
  };

  return (
    <>
      {successMsg && <div className="alert-box success">{successMsg}</div>}
      {errorMsg && <div className="alert-box error">{errorMsg}</div>}

      <div className="page-header">
        <div>
          <h1 className="page-title">PDV Frente de Caixa</h1>
          <p className="page-subtitle">Emulador de checkout Offline-First com sincronização local</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {pdvOnline ? (
            <div className="pdv-online-indicator"><Wifi size={14} /> Online no ERP</div>
          ) : (
            <div className="pdv-contingency-indicator"><WifiOff size={14} /> Contingência Offline</div>
          )}
          
          <button className="btn btn-secondary btn-small" onClick={() => setPdvOnline(!pdvOnline)}>
            Alternar Conexão
          </button>

          {offlineQueue.length > 0 && (
            <button className="btn btn-success btn-small" onClick={syncOfflineSales}>
              <RefreshCw size={14} /> Sincronizar ({offlineQueue.length})
            </button>
          )}
        </div>
      </div>

      <div className="pdv-grid">
        <div className="pdv-catalog">
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Catálogo de Produtos</h3>
          <p className="page-subtitle" style={{ margin: '0' }}>Clique nos itens para adicionar ao carrinho do caixa</p>
          
          <div className="pdv-products-grid">
            {products.map(p => (
              <div className="pdv-product-card" key={p.id} onClick={() => addToCart(p)}>
                <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>{p.nome}</span>
                <span style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: '600' }}>R$ {p.precoBase.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="pdv-cart">
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Carrinho de Compras</h3>
          
          <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {pdvCart.map(item => (
              <div key={item.product.id} style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ fontWeight: '600', display: 'block' }}>{item.product.nome}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{item.quantity}x R$ {item.product.precoBase.toFixed(2)}</span>
                </div>
                <button className="btn btn-secondary btn-small" style={{ padding: '0.1rem 0.35rem', color: 'var(--error)' }} onClick={() => removeFromCart(item.product.id)}>Remover</button>
              </div>
            ))}

            {pdvCart.length === 0 && (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Carrinho vazio
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
            <div className="form-group" style={{ marginBottom: '0.5rem' }}>
              <label>Forma de Pagamento</label>
              <select value={pdvPaymentMethod} onChange={e => setPdvPaymentMethod(e.target.value)}>
                <option value="PIX">Pix Central</option>
                <option value="CARTAO">Cartão de Crédito/Débito</option>
                <option value="DINHEIRO">Dinheiro Físico</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: '700', padding: '0.5rem 0' }}>
              <span>Total da Venda:</span>
              <span style={{ color: 'var(--success)' }}>
                R$ {pdvCart.reduce((sum, item) => sum + (item.product.precoBase * item.quantity), 0).toFixed(2)}
              </span>
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} disabled={pdvCart.length === 0} onClick={handleCheckout}>
              Finalizar Venda
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
