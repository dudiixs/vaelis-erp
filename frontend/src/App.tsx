import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  DollarSign, 
  Users, 
  Utensils, 
  ShoppingCart, 
  Wrench, 
  LogOut, 
  Key
} from 'lucide-react';
import { api } from './services/api';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Estoque from './pages/Estoque';
import Financeiro from './pages/Financeiro';
import RH from './pages/RH';
import KDS from './pages/KDS';
import PDV from './pages/PDV';
import Servicos from './pages/Servicos';
import Master from './pages/Master';

interface UserInfo {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  tenantId: string;
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  
  // Impersonation States
  const [isImpersonating, setIsImpersonating] = useState(false);

  // App Navigation
  const [activeTab, setActiveTab] = useState('dashboard');

  const fetchUserData = async () => {
    setUserInfo({
      id: localStorage.getItem('user_id') || 'usr_1',
      nome: localStorage.getItem('user_nome') || 'Administrador',
      email: localStorage.getItem('user_email') || 'admin@erp.com.br',
      cargo: localStorage.getItem('user_cargo') || 'MASTER',
      tenantId: localStorage.getItem('tenant_id') || 'ten_1',
    });
  };

  // --- Initial Auth Check ---
  useEffect(() => {
    const token = api.getToken();
    if (token) {
      setIsLoggedIn(true);
      fetchUserData();
      
      // Check if already impersonating
      const imp = api.getImpersonation();
      if (imp.tenantId) {
        setIsImpersonating(true);
      }
    }
  }, []);

  const handleLoginSuccess = (_token: string, uInfo: UserInfo) => {
    setIsLoggedIn(true);
    setUserInfo(uInfo);
  };

  const handleLogout = () => {
    api.logout();
    setIsLoggedIn(false);
    setUserInfo(null);
    setIsImpersonating(false);
    setActiveTab('dashboard');
  };

  const handleImpersonateStart = (tenantId: string, userId: string) => {
    api.setImpersonation(tenantId, userId);
    setIsImpersonating(true);
    // Reload user data or state
    fetchUserData();
  };

  const handleImpersonateStop = () => {
    api.setImpersonation(null, null);
    setIsImpersonating(false);
    fetchUserData();
  };

  // --- Render Auth Screens if not logged in ---
  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo-container">
          <LayoutDashboard size={24} style={{ color: 'var(--primary)' }} />
          <div>
            <span className="logo-text">Vaelis ERP</span>
            <span className="logo-badge" style={{ marginLeft: '0.5rem', fontSize: '0.6rem' }}>Core</span>
          </div>
        </div>

        <ul className="menu-list">
          <li>
            <button className={`menu-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
              <LayoutDashboard size={18} /> Painel Geral
            </button>
          </li>
          <li>
            <button className={`menu-item ${activeTab === 'estoque' ? 'active' : ''}`} onClick={() => setActiveTab('estoque')}>
              <Package size={18} /> Estoque & Grade
            </button>
          </li>
          <li>
            <button className={`menu-item ${activeTab === 'financeiro' ? 'active' : ''}`} onClick={() => setActiveTab('financeiro')}>
              <DollarSign size={18} /> Financeiro & PCO
            </button>
          </li>
          <li>
            <button className={`menu-item ${activeTab === 'rh' ? 'active' : ''}`} onClick={() => setActiveTab('rh')}>
              <Users size={18} /> RH & Ponto Facial
            </button>
          </li>
          <li>
            <button className={`menu-item ${activeTab === 'kds' ? 'active' : ''}`} onClick={() => setActiveTab('kds')}>
              <Utensils size={18} /> KDS Cozinha
            </button>
          </li>
          <li>
            <button className={`menu-item ${activeTab === 'pdv' ? 'active' : ''}`} onClick={() => setActiveTab('pdv')}>
              <ShoppingCart size={18} /> PDV Checkout
            </button>
          </li>
          <li>
            <button className={`menu-item ${activeTab === 'servicos' ? 'active' : ''}`} onClick={() => setActiveTab('servicos')}>
              <Wrench size={18} /> Ordens de Serviço
            </button>
          </li>
          <li>
            <button className={`menu-item ${activeTab === 'master' ? 'active' : ''}`} onClick={() => setActiveTab('master')}>
              <Key size={18} /> Software House
            </button>
          </li>
        </ul>

        {/* Support Impersonation Panel active indicator */}
        {isImpersonating && (
          <div className="impersonation-badge">
            <span style={{ fontWeight: '700' }}>Impersonating</span>
            <span>Tenant: {api.getImpersonation().tenantId}</span>
            <button onClick={handleImpersonateStop}>Voltar ao Normal</button>
          </div>
        )}

        {/* User profile footer */}
        <div className="user-footer">
          <div className="user-info">
            <span className="user-name">{userInfo?.nome}</span>
            <span className="user-role">{userInfo?.cargo} ({userInfo?.tenantId})</span>
          </div>
          <button className="logout-button" onClick={handleLogout} title="Desconectar">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'estoque' && <Estoque />}
        {activeTab === 'financeiro' && <Financeiro />}
        {activeTab === 'rh' && <RH />}
        {activeTab === 'kds' && <KDS />}
        {activeTab === 'pdv' && <PDV />}
        {activeTab === 'servicos' && <Servicos />}
        {activeTab === 'master' && (
          <Master 
            onImpersonateStart={handleImpersonateStart}
            isImpersonating={isImpersonating}
            onImpersonateStop={handleImpersonateStop}
          />
        )}
      </main>
    </div>
  );
}
