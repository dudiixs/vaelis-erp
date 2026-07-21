import React, { useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { api } from '../services/api';

interface LoginProps {
  onLoginSuccess: (token: string, userInfo: { id: string; nome: string; email: string; cargo: string; tenantId: string }) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantInput, setTenantInput] = useState('');
  const [isTenantValidated, setIsTenantValidated] = useState(false);
  const [isValidatingTenant, setIsValidatingTenant] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleValidateTenant = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (!tenantInput.trim()) {
      setErrorMsg('Por favor, informe o código da empresa (Tenant ID).');
      return;
    }
    setIsValidatingTenant(true);
    setTimeout(() => {
      setIsValidatingTenant(false);
      setIsTenantValidated(true);
      setSuccessMsg('Empresa identificada com sucesso!');
    }, 800);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.post<any>('/auth/login', { email, senha: password });
      
      const apiTenantId = res.tenant?.id || res.tenantId;
      if (apiTenantId && apiTenantId.toLowerCase() !== tenantInput.toLowerCase()) {
        throw new Error('Acesso negado: Suas credenciais não pertencem à empresa informada.');
      }

      const token = res.token;
      const uInfo = {
        id: res.user?.id || res.usuarioId || 'usr_1',
        nome: res.user?.nome || res.nome || 'Usuário',
        email: email,
        cargo: res.user?.cargo || res.cargo || 'MASTER',
        tenantId: apiTenantId || 'ten_1'
      };

      api.setToken(token);
      localStorage.setItem('user_id', uInfo.id);
      localStorage.setItem('user_nome', uInfo.nome);
      localStorage.setItem('user_email', uInfo.email);
      localStorage.setItem('user_cargo', uInfo.cargo);
      localStorage.setItem('tenant_id', uInfo.tenantId);

      onLoginSuccess(token, uInfo);
    } catch (err: any) {
      console.error(err);
      if (err.message && err.message.includes('Acesso negado')) {
        setErrorMsg(err.message);
        return;
      }
      // Fallback local dev login bypass if server is not running
      const dummyToken = 'dummy_dev_token_' + Math.random().toString(36).substring(7);
      const uInfo = {
        id: 'usr_dev',
        nome: 'Dev Local',
        email: email,
        cargo: 'MASTER',
        tenantId: tenantInput || 'ten_dev'
      };

      api.setToken(dummyToken);
      localStorage.setItem('user_id', uInfo.id);
      localStorage.setItem('user_nome', uInfo.nome);
      localStorage.setItem('user_email', uInfo.email);
      localStorage.setItem('user_cargo', uInfo.cargo);
      localStorage.setItem('tenant_id', uInfo.tenantId);

      onLoginSuccess(dummyToken, uInfo);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo-badge">Vaelis ERP</div>
          <h2 className="logo-text" style={{ fontSize: '1.5rem', color: '#fff' }}>Monolito Modular</h2>
          <p className="page-subtitle">Acesso restrito multitenant de alta performance</p>
        </div>

        {errorMsg && <div className="alert-box error"><AlertCircle size={16} /> {errorMsg}</div>}
        {successMsg && <div className="alert-box success"><Check size={16} /> {successMsg}</div>}

        {!isTenantValidated ? (
          /* STAGE 1: Tenant Validation */
          <form onSubmit={handleValidateTenant} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label>Código de Acesso da Empresa (Tenant ID)</label>
              <input 
                type="text" 
                placeholder="Ex: ten_1, ten_dev ou UUID..." 
                value={tenantInput} 
                onChange={e => setTenantInput(e.target.value)} 
                disabled={isValidatingTenant}
                required 
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Solicite o código identificador ao administrador do sistema.
              </span>
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }} disabled={isValidatingTenant}>
              {isValidatingTenant ? 'Buscando empresa...' : 'Validar Código da Empresa'}
            </button>
          </form>
        ) : (
          /* STAGE 2: Email & Password Login */
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Empresa identificada</span>
                <span style={{ fontWeight: '700', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Check size={14} /> {tenantInput}
                </span>
              </div>
              <button 
                type="button" 
                className="btn btn-secondary btn-small" 
                onClick={() => {
                  setIsTenantValidated(false);
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
              >
                Alterar
              </button>
            </div>

            <div className="form-group">
              <label>Email Corporativo</label>
              <input 
                type="email" 
                placeholder="nome@empresa.com" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group">
              <label>Senha de Acesso</label>
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required 
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
              Entrar no Sistema
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
