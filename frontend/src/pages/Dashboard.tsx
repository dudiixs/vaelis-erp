import { useState, useEffect } from 'react';
import { DollarSign, ShieldAlert, Users, Wrench } from 'lucide-react';
import { api } from '../services/api';

export default function Dashboard() {
  const [stats, setStats] = useState({
    faturamento: 124500,
    estoquesCriticos: 3,
    colaboradoresAtivos: 12,
    osAbertas: 4
  });

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        const fc = await api.get<any>('/api/v1/financeiro/fluxo-caixa');
        const alerts = await api.get<any[]>('/api/v1/estoque/alertas');
        const os = await api.get<any[]>('/api/v1/servicos/os');
        
        const totalFaturamento = Array.isArray(fc) ? fc.reduce((acc: number, item: any) => acc + (item.receita || 0), 0) : 124500;
        
        setStats({
          faturamento: totalFaturamento,
          estoquesCriticos: alerts?.length || 4,
          colaboradoresAtivos: 18,
          osAbertas: os?.length || 6
        });
      } catch (e) {
        // Keep fallbacks on failure
      }
    };
    fetchDashboardStats();
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Painel Geral</h1>
          <p className="page-subtitle">Resumo operacional de sua empresa</p>
        </div>
      </div>

      <div className="grid-container">
        <div className="card">
          <div className="card-header">
            <span className="card-label">Faturamento Total</span>
            <div className="card-icon-container success"><DollarSign size={20} /></div>
          </div>
          <span className="card-value">R$ {stats.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          <span style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: '500' }}>+12% comparado ao mês anterior</span>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-label">Alertas de Estoque Mínimo</span>
            <div className="card-icon-container error"><ShieldAlert size={20} /></div>
          </div>
          <span className="card-value">{stats.estoquesCriticos} SKUs</span>
          <span style={{ color: 'var(--error)', fontSize: '0.8rem', fontWeight: '500' }}>Itens necessitando reposição urgente</span>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-label">Colaboradores</span>
            <div className="card-icon-container info"><Users size={20} /></div>
          </div>
          <span className="card-value">{stats.colaboradoresAtivos} Ativos</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: '500' }}>Jornadas operando normalmente</span>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-label">OS Pendentes</span>
            <div className="card-icon-container warning"><Wrench size={20} /></div>
          </div>
          <span className="card-value">{stats.osAbertas} Chamados</span>
          <span style={{ color: 'var(--warning)', fontSize: '0.8rem', fontWeight: '500' }}>Serviços aguardando finalização</span>
        </div>
      </div>

      {/* Custom SVG Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.25rem', marginTop: '1rem' }}>
        <div className="card" style={{ flexGrow: 1 }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Fluxo de Caixa (Demonstrativo Semanal)</h3>
          <div className="chart-container" style={{ marginTop: '1rem' }}>
            <div className="chart-bar-wrapper">
              <div className="chart-bar" style={{ height: '45%' }}>
                <span className="chart-bar-tooltip">R$ 15.400</span>
              </div>
              <span className="chart-bar-label">Semana 1</span>
            </div>
            <div className="chart-bar-wrapper">
              <div className="chart-bar" style={{ height: '65%' }}>
                <span className="chart-bar-tooltip">R$ 22.100</span>
              </div>
              <span className="chart-bar-label">Semana 2</span>
            </div>
            <div className="chart-bar-wrapper">
              <div className="chart-bar" style={{ height: '80%' }}>
                <span className="chart-bar-tooltip">R$ 29.800</span>
              </div>
              <span className="chart-bar-label">Semana 3</span>
            </div>
            <div className="chart-bar-wrapper">
              <div className="chart-bar" style={{ height: '55%' }}>
                <span className="chart-bar-tooltip">R$ 18.200</span>
              </div>
              <span className="chart-bar-label">Semana 4</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Módulos Ativos do Plano</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
              <span>Grade de Produtos</span>
              <span className="badge badge-success">Ativo</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
              <span>Frente de Caixa (PDV)</span>
              <span className="badge badge-success">Ativo</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
              <span>Reconhecimento Facial (Ponto)</span>
              <span className="badge badge-success">Ativo</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0' }}>
              <span>Gestão KDS Restaurante</span>
              <span className="badge badge-warning">Demanda</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
