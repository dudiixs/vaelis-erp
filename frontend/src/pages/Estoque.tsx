import React, { useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';
import { api } from '../services/api';

interface Product {
  id: string;
  nome: string;
  sku: string;
  precoBase: number;
  gradeJson?: string;
  grades?: Array<{id: string, tamanho: string, cor: string, estoque: number}>;
}

export default function Estoque() {
  const [inventoryTab, setInventoryTab] = useState<'catalog' | 'suggestions' | 'batches'>('catalog');
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryAlerts, setInventoryAlerts] = useState<any[]>([]);
  const [purchaseSuggestions, setPurchaseSuggestions] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Batch states
  const [batches, setBatches] = useState<any[]>([
    { id: 'b1', produto: 'Camiseta Dry-Fit Azul (M)', loteCodigo: 'LOT-992A', quantidade: 25, dataValidade: '2026-08-02', dataFabricacao: '2026-07-02' },
    { id: 'b2', produto: 'Boné Esportivo Nylon Preto (UN)', loteCodigo: 'LOT-992B', quantidade: 15, dataValidade: '2026-09-15', dataFabricacao: '2026-07-05' },
    { id: 'b3', produto: 'Tênis Running Ultralight Vermelho (40)', loteCodigo: 'LOT-993C', quantidade: 8, dataValidade: '2026-07-28', dataFabricacao: '2026-06-01' }
  ]);
  const [batchProductGradeId, setBatchProductGradeId] = useState('');
  const [batchCode, setBatchCode] = useState('');
  const [batchQty, setBatchQty] = useState(0);
  const [batchExpiry, setBatchExpiry] = useState('');

  // Form states
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState(0);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);

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

  const fetchInventoryAlerts = async () => {
    try {
      const res = await api.get<any[]>('/api/v1/estoque/alertas');
      setInventoryAlerts(res || []);
    } catch (e) {
      setInventoryAlerts([
        { produto: 'Camiseta Dry-Fit Azul (M)', estoqueAtual: 2, estoqueMinimo: 10, status: 'Crítico' },
        { produto: 'Boné Esportivo Nylon Preto (UN)', estoqueAtual: 4, estoqueMinimo: 8, status: 'Atenção' }
      ]);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchInventoryAlerts();
  }, []);

  const fetchPurchaseSuggestions = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.get<any[]>('/api/v1/estoque/sugestoes-compra');
      setPurchaseSuggestions(res || []);
      setSuccessMsg('Sugestões geradas pela inteligência de estoque baseadas em histórico e demanda mínima.');
    } catch (e) {
      setPurchaseSuggestions([
        { produto: 'Camiseta Dry-Fit Azul (M)', qtdSugerida: 25, custoEstimadoUnitario: 22.00, custoTotalEstimado: 550.00 },
        { produto: 'Boné Esportivo Nylon Preto (UN)', qtdSugerida: 15, custoEstimadoUnitario: 12.50, custoTotalEstimado: 187.50 }
      ]);
      setSuccessMsg('Simulado: Sugestões geradas localmente.');
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const sku = newProdName.substring(0, 3).toUpperCase() + '-' + Math.floor(Math.random() * 1000);
      const grade = {
        tamanhos: selectedSizes,
        cores: selectedColors
      };
      
      await api.post('/api/v1/estoque/produtos', {
        nome: newProdName,
        sku: sku,
        precoBase: Number(newProdPrice),
        gradeJson: JSON.stringify(grade)
      });

      setSuccessMsg(`Produto "${newProdName}" com Grade de Variações criado com sucesso!`);
      setNewProdName('');
      setNewProdPrice(0);
      setSelectedSizes([]);
      setSelectedColors([]);
      fetchProducts();
    } catch (err: any) {
      // Local addition for simulation
      const mockProd: Product = {
        id: 'mock_' + Date.now(),
        nome: newProdName,
        sku: 'MOCK-' + Math.floor(Math.random() * 1000),
        precoBase: Number(newProdPrice),
        gradeJson: JSON.stringify({ tamanhos: selectedSizes, cores: selectedColors })
      };
      setProducts(prev => [mockProd, ...prev]);
      setSuccessMsg(`Simulação: Produto "${newProdName}" criado localmente.`);
      setNewProdName('');
      setNewProdPrice(0);
    }
  };

  return (
    <>
      {successMsg && <div className="alert-box success">{successMsg}</div>}
      {errorMsg && <div className="alert-box error">{errorMsg}</div>}

      <div className="page-header">
        <div>
          <h1 className="page-title">Estoque & Grade</h1>
          <p className="page-subtitle">Gerenciamento de produtos, SKUs com grade e compras</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={`btn btn-secondary ${inventoryTab === 'catalog' ? 'active' : ''}`} onClick={() => setInventoryTab('catalog')}>Catálogo</button>
          <button className={`btn btn-secondary ${inventoryTab === 'batches' ? 'active' : ''}`} onClick={() => setInventoryTab('batches')}>Lotes & Validades (FEFO)</button>
          <button className={`btn btn-secondary ${inventoryTab === 'suggestions' ? 'active' : ''}`} onClick={() => setInventoryTab('suggestions')}>Reposição & Inteligência</button>
        </div>
      </div>

      {inventoryTab === 'catalog' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
          {/* Create Product with variation grades */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Cadastrar SKU com Grade</h3>
            <form onSubmit={handleCreateProduct} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group">
                <label>Nome do Produto</label>
                <input type="text" placeholder="Ex: Camiseta Dry-Fit" value={newProdName} onChange={e => setNewProdName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Preço Base (R$)</label>
                <input type="number" step="0.01" placeholder="Ex: 59.90" value={newProdPrice || ''} onChange={e => setNewProdPrice(Number(e.target.value))} required />
              </div>
              
              {/* Grade configs */}
              <div className="form-group">
                <label>Tamanhos da Grade (Selecione)</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {['P', 'M', 'G', 'GG'].map(size => {
                    const active = selectedSizes.includes(size);
                    return (
                      <button 
                        key={size}
                        type="button" 
                        onClick={() => setSelectedSizes(prev => active ? prev.filter(s => s !== size) : [...prev, size])}
                        className={`btn btn-secondary btn-small ${active ? 'btn-primary' : ''}`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="form-group">
                <label>Cores da Grade (Selecione)</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {['Azul', 'Vermelho', 'Preto', 'Branco'].map(color => {
                    const active = selectedColors.includes(color);
                    return (
                      <button 
                        key={color}
                        type="button" 
                        onClick={() => setSelectedColors(prev => active ? prev.filter(c => c !== color) : [...prev, color])}
                        className={`btn btn-secondary btn-small ${active ? 'btn-primary' : ''}`}
                      >
                        {color}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>Cadastrar Produto</button>
            </form>
          </div>

          {/* Catalog list */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Produtos Cadastrados</h3>
            <div className="table-container" style={{ marginTop: '0.5rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>SKU / ID</th>
                    <th>Nome</th>
                    <th>Preço Base</th>
                    <th>Grade / Variações</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => {
                    let variations = 'Nenhuma variação';
                    if (p.gradeJson) {
                      try {
                        const grade = JSON.parse(p.gradeJson);
                        variations = `Tamanhos: ${grade.tamanhos?.join(', ') || 'N/A'} | Cores: ${grade.cores?.join(', ') || 'N/A'}`;
                      } catch (_) {}
                    }
                    return (
                      <tr key={p.id}>
                        <td style={{ fontWeight: '600' }}>{p.sku || p.id}</td>
                        <td>{p.nome}</td>
                        <td>R$ {p.precoBase.toFixed(2)}</td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{variations}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {inventoryTab === 'suggestions' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem' }}>
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldAlert style={{ color: 'var(--error)' }} /> Estoques Críticos
            </h3>
            <p className="page-subtitle" style={{ marginBottom: '0.5rem' }}>Produtos com estoque atual abaixo do mínimo configurado</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {inventoryAlerts.map((a, i) => (
                <div key={i} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', backgroundColor: 'var(--bg-secondary)', display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: '600', display: 'block' }}>{a.produto}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mínimo: {a.estoqueMinimo} unidades</span>
                  </div>
                  <span className="badge badge-error" style={{ fontSize: '0.85rem' }}>{a.estoqueAtual} Un.</span>
                </div>
              ))}
            </div>

            <button className="btn btn-primary" onClick={fetchPurchaseSuggestions} style={{ marginTop: '1rem', width: '100%' }}>
              <RefreshCw size={16} /> Analisar & Sugerir Compra Inteligente
            </button>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Sugestões Inteligentes de Reposição</h3>
            <p className="page-subtitle" style={{ marginBottom: '0.5rem' }}>Previsões estimadas para regularização de estoque e custos esperados</p>
            
            {purchaseSuggestions.length > 0 ? (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Qtd Sugerida</th>
                      <th>Custo Unit. Estimado</th>
                      <th>Custo Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseSuggestions.map((s, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: '600' }}>{s.produto}</td>
                        <td>{s.qtdSugerida} Un.</td>
                        <td>R$ {s.custoEstimadoUnitario.toFixed(2)}</td>
                        <td style={{ color: 'var(--success)', fontWeight: '600' }}>R$ {s.custoTotalEstimado.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                <span>Nenhuma análise carregada. Clique no botão ao lado.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {inventoryTab === 'batches' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem' }}>
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Registrar Lote de Produção</h3>
            <p className="page-subtitle" style={{ marginBottom: '0.75rem' }}>Entrada de lotes com validade. O sistema prioriza a saída do lote que vence primeiro (FEFO).</p>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const selectedProd = products.find(p => p.id === batchProductGradeId);
              const newBatch = {
                id: 'b_' + Date.now(),
                produto: selectedProd ? selectedProd.nome : 'Produto Avulso',
                loteCodigo: batchCode,
                quantidade: Number(batchQty),
                dataValidade: batchExpiry,
                dataFabricacao: new Date().toISOString().split('T')[0]
              };
              setBatches(prev => [...prev, newBatch]);
              setSuccessMsg(`Lote ${batchCode} adicionado ao estoque!`);
              setBatchCode('');
              setBatchQty(0);
              setBatchExpiry('');
            }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group">
                <label>Produto</label>
                <select value={batchProductGradeId} onChange={e => setBatchProductGradeId(e.target.value)} required>
                  <option value="">Selecione...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Código do Lote</label>
                <input type="text" placeholder="Ex: LOT-2026A" value={batchCode} onChange={e => setBatchCode(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Quantidade do Lote</label>
                <input type="number" placeholder="Ex: 50" value={batchQty || ''} onChange={e => setBatchQty(Number(e.target.value))} required />
              </div>
              <div className="form-group">
                <label>Data de Validade</label>
                <input type="date" value={batchExpiry} onChange={e => setBatchExpiry(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary">Adicionar Lote</button>
            </form>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Fila de Validades Ativas (FEFO Order)
            </h3>
            <p className="page-subtitle" style={{ marginBottom: '0.5rem' }}>Sugestões automáticas de picking baseadas nas datas de vencimento mais próximas</p>
            
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Lote</th>
                    <th>Produto</th>
                    <th>Estoque</th>
                    <th>Validade</th>
                    <th>Alerta FEFO</th>
                  </tr>
                </thead>
                <tbody>
                  {[...batches].sort((a,b) => new Date(a.dataValidade).getTime() - new Date(b.dataValidade).getTime()).map(b => {
                    const daysLeft = Math.ceil((new Date(b.dataValidade).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    const isUrgent = daysLeft < 30;
                    return (
                      <tr key={b.id} style={{ borderLeft: isUrgent ? '3px solid var(--error)' : 'none' }}>
                        <td style={{ fontWeight: '600' }}><code>{b.loteCodigo}</code></td>
                        <td>{b.produto}</td>
                        <td>{b.quantidade} Un.</td>
                        <td>{b.dataValidade}</td>
                        <td>
                          {isUrgent ? (
                            <span className="badge badge-error">SAÍDA CRÍTICA ({daysLeft} dias!)</span>
                          ) : (
                            <span className="badge badge-success">Estável ({daysLeft} dias)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
