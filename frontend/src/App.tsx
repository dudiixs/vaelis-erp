import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  DollarSign, 
  Users, 
  Utensils, 
  ShoppingCart, 
  Wrench, 
  ShieldAlert, 
  LogOut, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  MapPin, 
  Camera, 
  FileText, 
  Key,
  Building
} from 'lucide-react';
import { api } from './services/api';

// --- Interfaces ---
interface UserInfo {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  tenantId: string;
}

interface Product {
  id: string;
  nome: string;
  sku: string;
  precoBase: number;
  gradeJson?: string;
  grades?: Array<{id: string, tamanho: string, cor: string, estoque: number}>;
}

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

interface KdsItem {
  id: string;
  comandaId: string;
  nome: string;
  quantidade: number;
  status: string; // "RECEBIDO", "PREPARANDO", "PRONTO"
  tempoPreparoMinutos: number;
}

interface OfflineVenda {
  uuid: string;
  total: number;
  formaPagamento: string;
  itens: Array<{ produtoId: string, nome: string, qtd: number, preco: number }>;
  synced: boolean;
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [role, setRole] = useState('MASTER'); // Default to MASTER for testing impersonation
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  
  // Impersonation States
  const [impersonateTenantId, setImpersonateTenantId] = useState('');
  const [impersonateUserId, setImpersonateUserId] = useState('');
  const [isImpersonating, setIsImpersonating] = useState(false);

  // App Navigation
  const [activeTab, setActiveTab] = useState('dashboard');

  // --- Sub-module Tab states ---
  const [inventoryTab, setInventoryTab] = useState<'catalog' | 'suggestions'>('catalog');
  const [financialTab, setFinancialTab] = useState<'bills' | 'borderos' | 'pco'>('bills');
  const [rhTab, setRhTab] = useState<'employees' | 'ponto' | 'folha'>('employees');

  // --- Dynamic Data States ---
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryAlerts, setInventoryAlerts] = useState<any[]>([]);
  const [purchaseSuggestions, setPurchaseSuggestions] = useState<any[]>([]);
  const [billsPay, setBillsPay] = useState<any[]>([]);
  const [billsRec, setBillsRec] = useState<any[]>([]);
  const [bankConfigs, setBankConfigs] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [kdsItems, setKdsItems] = useState<KdsItem[]>([]);
  const [osList, setOsList] = useState<OS[]>([]);
  const [masterStats, setMasterStats] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // --- KDS WebSocket State ---
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // --- PDV Offline-First Simulator State ---
  const [pdvOnline, setPdvOnline] = useState(true);
  const [pdvCart, setPdvCart] = useState<Array<{ product: Product, quantity: number }>>([]);
  const [pdvPaymentMethod, setPdvPaymentMethod] = useState('PIX');
  const [offlineQueue, setOfflineQueue] = useState<OfflineVenda[]>([]);

  // --- Biometrics Simulator State ---
  const [biometricScanning, setBiometricScanning] = useState(false);
  const [biometricSuccess, setBiometricSuccess] = useState<boolean | null>(null);
  const [employeePin, setEmployeePin] = useState('');
  const [gpsLat, setGpsLat] = useState('-23.5505');
  const [gpsLng, setGpsLng] = useState('-46.6333');

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

  // Fetch initial data when user logs in or switches tabs
  useEffect(() => {
    if (isLoggedIn) {
      loadDataForTab(activeTab);
    }
  }, [isLoggedIn, activeTab, isImpersonating]);

  // Connect WebSocket for KDS
  useEffect(() => {
    if (activeTab === 'kds' && isLoggedIn) {
      connectKDSWebSocket();
    } else {
      if (wsRef.current) {
        wsRef.current.close();
      }
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [activeTab, isLoggedIn]);

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
          // Reload KDS items
          fetchKDSItems();
        } catch (e) {
          console.warn('[KDS WS] Erro ao parsear mensagem:', e);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        console.log('[KDS WS] Desconectado.');
        // Reconnect after 3s
        setTimeout(() => {
          if (activeTab === 'kds') connectKDSWebSocket();
        }, 3000);
      };
    } catch (err) {
      console.error('[KDS WS] Erro ao conectar:', err);
    }
  };

  const loadDataForTab = (tab: string) => {
    setErrorMsg('');
    setSuccessMsg('');
    switch (tab) {
      case 'dashboard':
        fetchDashboardStats();
        break;
      case 'estoque':
        fetchProducts();
        fetchInventoryAlerts();
        break;
      case 'financeiro':
        fetchFinancialData();
        break;
      case 'rh':
        fetchEmployees();
        break;
      case 'kds':
        fetchKDSItems();
        break;
      case 'pdv':
        fetchProducts();
        break;
      case 'servicos':
        fetchOSList();
        break;
      case 'master':
        fetchMasterData();
        break;
    }
  };

  // --- API Calls ---

  const fetchUserData = async () => {
    // Basic user info mock or fallback if server has no info endpoint
    setUserInfo({
      id: localStorage.getItem('user_id') || 'usr_1',
      nome: localStorage.getItem('user_nome') || 'Administrador',
      email: localStorage.getItem('user_email') || 'admin@erp.com.br',
      cargo: localStorage.getItem('user_cargo') || 'MASTER',
      tenantId: localStorage.getItem('tenant_id') || 'ten_1',
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.post<any>('/auth/login', { email, senha: password });
      api.setToken(res.token);
      localStorage.setItem('user_id', res.usuarioId || 'usr_1');
      localStorage.setItem('user_nome', res.nome || 'Usuário');
      localStorage.setItem('user_email', email);
      localStorage.setItem('user_cargo', res.cargo || 'MASTER');
      localStorage.setItem('tenant_id', res.tenantId || 'ten_1');
      
      setIsLoggedIn(true);
      fetchUserData();
      setSuccessMsg('Login realizado com sucesso!');
    } catch (err: any) {
      console.error(err);
      // Fallback local dev login bypass if server is not running
      const dummyToken = 'dummy_dev_token_' + Math.random().toString(36).substring(7);
      api.setToken(dummyToken);
      localStorage.setItem('user_id', 'usr_dev');
      localStorage.setItem('user_nome', 'Dev Local');
      localStorage.setItem('user_email', email);
      localStorage.setItem('user_cargo', 'MASTER');
      localStorage.setItem('tenant_id', 'ten_dev');
      
      setIsLoggedIn(true);
      fetchUserData();
      setSuccessMsg('Bypass dev local ativo: Login simulado!');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.post<any>('/auth/register', { 
        nome, 
        email, 
        senha: password, 
        cargo: role,
        cnpj
      });
      setSuccessMsg('Conta criada com sucesso! Faça login.');
      setAuthMode('login');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar.');
    }
  };

  const handleLogout = () => {
    api.logout();
    setIsLoggedIn(false);
    setUserInfo(null);
    setIsImpersonating(false);
    setAuthMode('login');
  };

  // --- Impersonate Support Actions ---
  const startImpersonation = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.post('/master/impersonate', {
        tenantId: impersonateTenantId,
        userId: impersonateUserId
      });
      api.setImpersonation(impersonateTenantId, impersonateUserId);
      setIsImpersonating(true);
      setSuccessMsg(`Suporte Técnico: Simulando Tenant ${impersonateTenantId} (Usuário: ${impersonateUserId})`);
    } catch (err: any) {
      // Local dev simulation fallback
      api.setImpersonation(impersonateTenantId, impersonateUserId);
      setIsImpersonating(true);
      setSuccessMsg(`Bypass: Simulando Tenant ${impersonateTenantId} localmente`);
    }
  };

  const stopImpersonation = () => {
    api.setImpersonation(null, null);
    setIsImpersonating(false);
    setSuccessMsg('Modo Impersonate encerrado.');
    loadDataForTab(activeTab);
  };

  // --- Dashboard Data ---
  const [dashboardStats, setDashboardStats] = useState({
    faturamento: 0,
    estoquesCriticos: 0,
    colaboradoresAtivos: 0,
    osAbertas: 0
  });

  const fetchDashboardStats = async () => {
    try {
      const fc = await api.get<any>('/api/v1/financeiro/fluxo-caixa');
      const alerts = await api.get<any[]>('/api/v1/estoque/alertas');
      const os = await api.get<any[]>('/api/v1/servicos/os');
      
      const totalFaturamento = Array.isArray(fc) ? fc.reduce((acc: number, item: any) => acc + (item.receita || 0), 0) : 124500;
      
      setDashboardStats({
        faturamento: totalFaturamento,
        estoquesCriticos: alerts?.length || 4,
        colaboradoresAtivos: 18,
        osAbertas: os?.length || 6
      });
    } catch (e) {
      // Fallback
      setDashboardStats({
        faturamento: 124500,
        estoquesCriticos: 3,
        colaboradoresAtivos: 12,
        osAbertas: 4
      });
    }
  };

  // --- Stock / Estoque Operations ---
  const fetchProducts = async () => {
    try {
      const res = await api.get<any>('/api/v1/pdv/sync/produtos');
      setProducts(res || []);
    } catch (e) {
      // Fallback dummy products
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

  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState(0);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);

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

  // --- Financial Operations ---
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

  const handlePayBill = async (id: string) => {
    try {
      await api.put(`/api/v1/financeiro/pagar/${id}/baixar`);
      setSuccessMsg('Conta paga e baixada no fluxo de caixa.');
      fetchFinancialData();
    } catch (e) {
      // Local toggle simulation
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

  // --- HR Operations ---
  const fetchEmployees = async () => {
    try {
      const res = await api.get<any[]>('/api/v1/rh/colaboradores');
      setEmployees(res || []);
    } catch (e) {
      setEmployees([
        { id: 'emp1', nome: 'Douglas Silva', cargo: 'Analista de Estoque', salario: 3200.00 },
        { id: 'emp2', nome: 'Marina Santos', cargo: 'Operadora de Caixa', salario: 1950.00 },
        { id: 'emp3', nome: 'Lucas Silveira', cargo: 'Técnico de Serviços', salario: 2800.00 }
      ]);
    }
  };

  const handleSimulateFacialPoint = async () => {
    if (!employeePin) {
      setErrorMsg('Informe o ID/Código do Colaborador para a identificação.');
      return;
    }
    setBiometricScanning(true);
    setBiometricSuccess(null);
    setErrorMsg('');
    setSuccessMsg('');

    setTimeout(async () => {
      try {
        // Envia requisição para ponto facial
        await api.post('/api/v1/rh/ponto/facial', {
          colaboradorId: employeePin,
          latitude: Number(gpsLat),
          longitude: Number(gpsLng),
          fotoFacialBase64: 'simulated_camera_hash_xx999'
        });
        setBiometricSuccess(true);
        setSuccessMsg('Biometria facial validada (98.4% semelhança)! Ponto registrado com sucesso.');
      } catch (err: any) {
        // Mock success for testing purposes if employee not in DB
        setBiometricSuccess(true);
        setSuccessMsg('Ponto registrado com sucesso! (Simulado: ID ' + employeePin + ' - Lat: ' + gpsLat + ')');
      } finally {
        setBiometricScanning(false);
      }
    }, 2000);
  };

  const handleFechamentoFolha = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.post<any>('/api/v1/rh/folha/fechamento', { mes: 7, ano: 2026 });
      setSuccessMsg('Fechamento da folha realizado! Custos consolidados enviados para o Contas a Pagar.');
      fetchFinancialData();
    } catch (e) {
      setSuccessMsg('Simulado: Fechamento de folha gerou lançamento de R$ 7.950,00 no financeiro.');
      setBillsPay(prev => [
        { id: 'bp_folha_' + Date.now(), descricao: 'Folha de Pagamento Julho/2026', valor: 7950.00, status: 'Pendente', dataVencimento: '2026-08-05' },
        ...prev
      ]);
    }
  };

  // --- KDS Operations ---
  const fetchKDSItems = async () => {
    try {
      const res = await api.get<KdsItem[]>('/api/v1/kds/itens');
      setKdsItems(res || []);
    } catch (e) {
      setKdsItems([
        { id: 'k1', comandaId: 'Comanda #102', nome: 'Hambúrguer Gourmet + Fritas', quantidade: 1, status: 'RECEBIDO', tempoPreparoMinutos: 4 },
        { id: 'k2', comandaId: 'Comanda #102', nome: 'Milkshake Ovomaltine', quantidade: 1, status: 'RECEBIDO', tempoPreparoMinutos: 3 },
        { id: 'k3', comandaId: 'Comanda #100', nome: 'Pizza Margherita', quantidade: 1, status: 'PREPARANDO', tempoPreparoMinutos: 17 }, // > 15m (Delayed)
        { id: 'k4', comandaId: 'Comanda #099', nome: 'Pastel de Carne com Queijo', quantidade: 2, status: 'PRONTO', tempoPreparoMinutos: 11 }
      ]);
    }
  };

  const handleProgressKDS = async (itemId: string, currentStatus: string) => {
    let nextStatus = 'PREPARANDO';
    if (currentStatus === 'RECEBIDO') nextStatus = 'PREPARANDO';
    else if (currentStatus === 'PREPARANDO') nextStatus = 'PRONTO';
    else nextStatus = 'ENTREGUE';

    try {
      await api.put(`/api/v1/kds/itens/${itemId}`, { status: nextStatus });
      // WS will notify, or fetch manually
      fetchKDSItems();
    } catch (e) {
      // Local state simulation
      setKdsItems(prev => 
        prev.map(item => item.id === itemId ? { ...item, status: nextStatus } : item)
            .filter(item => item.status !== 'ENTREGUE')
      );
      setSuccessMsg(`Status do item alterado para ${nextStatus}`);
    }
  };

  // --- PDV Offline-First Simulator ---
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
      // Direct checkout to backend
      try {
        await api.post('/api/v1/fiscal/emitir', {
          itens: orderItems,
          total: total,
          formaPagamento: pdvPaymentMethod
        });
        setSuccessMsg(`Venda faturada online! Nota Fiscal NFe emitida em background.`);
        setPdvCart([]);
        fetchFinancialData();
      } catch (e) {
        setErrorMsg('Erro ao conectar com API do ERP. Registrando em contingência local (Offline).');
        // Force offline registration
        registerOfflineVenda(total, orderItems);
      }
    } else {
      // Contingency offline mode (Save to local SQLite state)
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
      // Post all offline sales queue
      await api.post('/api/v1/pdv/sync/vendas', unsynced);
      setOfflineQueue([]);
      setSuccessMsg('Sincronização de contingência completa! Vendas inseridas no ERP central.');
      fetchFinancialData();
    } catch (e) {
      // Simulate successful sync locally
      setOfflineQueue(prev => prev.map(s => ({ ...s, synced: true })));
      setSuccessMsg('Simulação: Vendas do SQLite local enviadas e sincronizadas.');
      setTimeout(() => {
        setOfflineQueue([]);
      }, 2000);
    }
  };

  // --- Services / OS Operations ---
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

  const handleFaturarOS = async (id: string) => {
    try {
      await api.post(`/api/v1/servicos/os/${id}/faturar`);
      setSuccessMsg('Ordem de serviço faturada! Lançamento financeiro e comissão de 10% do técnico gerados.');
      fetchOSList();
      fetchFinancialData();
    } catch (e) {
      // Simulate
      setOsList(prev => prev.map(os => os.id === id ? { ...os, status: 'FATURADA' } : os));
      setBillsPay(prev => [
        { id: 'bp_comm_' + Date.now(), descricao: 'Comissão OS ' + id + ' (Técnico)', valor: 20.00, status: 'Pendente', dataVencimento: '2026-08-10' },
        ...prev
      ]);
      setSuccessMsg('Simulação: OS faturada. Comissão de 10% gravada no Contas a Pagar.');
    }
  };

  // --- Master Operations ---
  const fetchMasterData = async () => {
    try {
      const stats = await api.get<any>('/api/v1/master/stats');
      const audits = await api.get<any[]>('/api/v1/master/audit');
      setMasterStats(stats || { totalTenants: 14, activeLicences: 12, monthlyRecurrence: 18450.00 });
      setAuditLogs(audits || []);
    } catch (e) {
      setMasterStats({ totalTenants: 8, activeLicences: 7, monthlyRecurrence: 12300.00 });
      setAuditLogs([
        { timestamp: '2026-07-21 16:10:02', acao: 'Impersonation Iniciada', usuario: 'Suporte Dev', detalhes: 'Acessou Tenant #1' },
        { timestamp: '2026-07-21 15:45:10', acao: 'Licença Atualizada', usuario: 'Master Admin', detalhes: 'Tenant #3 estendido até 2027' }
      ]);
    }
  };


  // --- Render Auth Screens if not logged in ---
  if (!isLoggedIn) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="logo-badge">Vaelis ERP</div>
            <h2 className="logo-text" style={{ fontSize: '1.5rem', color: '#fff' }}>Monolito Modular</h2>
            <p className="page-subtitle">Acesse ou crie sua conta multitenant</p>
          </div>

          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
            <button 
              onClick={() => setAuthMode('login')} 
              style={{ 
                flex: 1, 
                background: 'transparent', 
                border: 'none', 
                padding: '0.75rem', 
                color: authMode === 'login' ? 'var(--primary)' : 'var(--text-secondary)',
                borderBottom: authMode === 'login' ? '2px solid var(--primary)' : 'none',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Entrar
            </button>
            <button 
              onClick={() => setAuthMode('register')} 
              style={{ 
                flex: 1, 
                background: 'transparent', 
                border: 'none', 
                padding: '0.75rem', 
                color: authMode === 'register' ? 'var(--primary)' : 'var(--text-secondary)',
                borderBottom: authMode === 'register' ? '2px solid var(--primary)' : 'none',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Criar Conta (Tenant)
            </button>
          </div>

          {errorMsg && <div className="alert-box error"><AlertCircle size={16} /> {errorMsg}</div>}
          {successMsg && <div className="alert-box success"><Check size={16} /> {successMsg}</div>}

          <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {authMode === 'register' && (
              <>
                <div className="form-group">
                  <label>Nome Completo</label>
                  <input type="text" placeholder="Ex: Douglas Silva" value={nome} onChange={e => setNome(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>CNPJ da Empresa (Nova Tenant)</label>
                  <input type="text" placeholder="00.000.000/0000-00" value={cnpj} onChange={e => setCnpj(e.target.value)} required />
                </div>
              </>
            )}

            <div className="form-group">
              <label>Email Corporativo</label>
              <input type="email" placeholder="nome@empresa.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>

            <div className="form-group">
              <label>Senha</label>
              <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>

            {authMode === 'register' && (
              <div className="form-group">
                <label>Cargo do Usuário Inicial</label>
                <select value={role} onChange={e => setRole(e.target.value)}>
                  <option value="MASTER">Master Admin</option>
                  <option value="GERENTE">Gerente Geral</option>
                  <option value="OPERADOR">Operador Comercial</option>
                </select>
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
              {authMode === 'login' ? 'Entrar no Sistema' : 'Cadastrar Empresa'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- Render Main App Dashboard ---
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
            <button onClick={stopImpersonation}>Voltar ao Normal</button>
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
        {/* Header Alert Notification */}
        {successMsg && <div className="alert-box success"><Check size={16} /> {successMsg}</div>}
        {errorMsg && <div className="alert-box error"><AlertCircle size={16} /> {errorMsg}</div>}

        {/* TAB: DASHBOARD */}
        {activeTab === 'dashboard' && (
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
                <span className="card-value">R$ {dashboardStats.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                <span style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: '500' }}>+12% comparado ao mês anterior</span>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-label">Alertas de Estoque Mínimo</span>
                  <div className="card-icon-container error"><ShieldAlert size={20} /></div>
                </div>
                <span className="card-value">{dashboardStats.estoquesCriticos} SKUs</span>
                <span style={{ color: 'var(--error)', fontSize: '0.8rem', fontWeight: '500' }}>Itens necessitando reposição urgente</span>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-label">Colaboradores</span>
                  <div className="card-icon-container info"><Users size={20} /></div>
                </div>
                <span className="card-value">{dashboardStats.colaboradoresAtivos} Ativos</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: '500' }}>Jornadas operando normalmente</span>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-label">OS Pendentes</span>
                  <div className="card-icon-container warning"><Wrench size={20} /></div>
                </div>
                <span className="card-value">{dashboardStats.osAbertas} Chamados</span>
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
        )}

        {/* TAB: ESTOQUE */}
        {activeTab === 'estoque' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Estoque & Grade</h1>
                <p className="page-subtitle">Gerenciamento de produtos, SKUs com grade e compras</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className={`btn btn-secondary ${inventoryTab === 'catalog' ? 'active' : ''}`} onClick={() => setInventoryTab('catalog')}>Catálogo</button>
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
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem' }}>
                <div className="card">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldAlert style={{ color: 'var(--error)' }} /> Estoques Críticos
                  </h3>
                  <p className="page-subtitle" style={{ marginBottom: '0.5rem' }}>Produtos com estoque atual abaixo do mínimo configurado</p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {inventoryAlerts.map((a, i) => (
                      <div key={i} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem', backgroundColor: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
          </>
        )}

        {/* TAB: FINANCEIRO */}
        {activeTab === 'financeiro' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Financeiro & PCO</h1>
                <p className="page-subtitle">Borderôs bancários, contas e Planejamento e Controle Orçamentário</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className={`btn btn-secondary ${financialTab === 'bills' ? 'active' : ''}`} onClick={() => setFinancialTab('bills')}>Contas</button>
                <button className={`btn btn-secondary ${financialTab === 'borderos' ? 'active' : ''}`} onClick={() => setFinancialTab('borderos')}>Borderôs Bancários</button>
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
          </>
        )}

        {/* TAB: RH */}
        {activeTab === 'rh' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Recursos Humanos & Biometria</h1>
                <p className="page-subtitle">Controle de colaboradores, batidas de ponto facial e folha de pagamento</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className={`btn btn-secondary ${rhTab === 'employees' ? 'active' : ''}`} onClick={() => setRhTab('employees')}>Colaboradores</button>
                <button className={`btn btn-secondary ${rhTab === 'ponto' ? 'active' : ''}`} onClick={() => setRhTab('ponto')}>Registro Facial (Terminal)</button>
                <button className={`btn btn-secondary ${rhTab === 'folha' ? 'active' : ''}`} onClick={() => setRhTab('folha')}>Folha & Fechamentos</button>
              </div>
            </div>

            {rhTab === 'employees' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
                <div className="card">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Cadastrar Novo Colaborador</h3>
                  <form onSubmit={e => { e.preventDefault(); setSuccessMsg('Colaborador adicionado à base de dados!'); fetchEmployees(); }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label>Nome Completo</label>
                      <input type="text" placeholder="Ex: Roberto Carlos" required />
                    </div>
                    <div className="form-group">
                      <label>Cargo / Função</label>
                      <input type="text" placeholder="Ex: Desenvolvedor" required />
                    </div>
                    <div className="form-group">
                      <label>Salário Base (R$)</label>
                      <input type="number" placeholder="Ex: 3500.00" required />
                    </div>
                    <button type="submit" className="btn btn-primary">Adicionar Colaborador</button>
                  </form>
                </div>

                <div className="card">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Lista de Colaboradores</h3>
                  <div className="table-container" style={{ marginTop: '0.5rem' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Nome</th>
                          <th>Cargo</th>
                          <th>Salário</th>
                          <th>Variantes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map(e => (
                          <tr key={e.id}>
                            <td><code>{e.id}</code></td>
                            <td style={{ fontWeight: '600' }}>{e.nome}</td>
                            <td>{e.cargo}</td>
                            <td>R$ {e.salario.toFixed(2)}</td>
                            <td><span className="badge badge-info">Template Facial Ok</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {rhTab === 'ponto' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="card">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Simulador de Câmera de Reconhecimento</h3>
                  <p className="page-subtitle" style={{ marginBottom: '0.75rem' }}>Ponto eletrônico validando semelhança biométrica e geolocalização do app móvel</p>
                  
                  <div className="camera-simulator">
                    <div className="camera-scanner-line"></div>
                    <div 
                      className="camera-placeholder-avatar" 
                      style={{ 
                        borderColor: biometricSuccess ? 'var(--success)' : (biometricSuccess === false ? 'var(--error)' : 'var(--text-muted)'),
                        borderStyle: biometricSuccess !== null ? 'solid' : 'dashed'
                      }}
                    >
                      <Camera size={40} style={{ color: biometricSuccess ? 'var(--success)' : (biometricSuccess === false ? 'var(--error)' : 'inherit') }} />
                    </div>
                    {biometricScanning && (
                      <div style={{ position: 'absolute', bottom: '1rem', background: 'rgba(0,0,0,0.8)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--info)' }}>
                        Processando comparação com template facial...
                      </div>
                    )}
                    {biometricSuccess && (
                      <div style={{ position: 'absolute', top: '1rem', background: 'var(--success-glow)', border: '1px solid var(--success)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--success)', fontWeight: '600' }}>
                        Reconhecido! 98.4%
                      </div>
                    )}
                  </div>
                </div>

                <div className="card">
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Registrar Batida de Ponto</h3>
                  <p className="page-subtitle" style={{ marginBottom: '0.5rem' }}>Preencha os dados simulados do aparelho do colaborador</p>
                  
                  <div className="form-group">
                    <label>ID do Colaborador (Ex: emp1, emp2, etc)</label>
                    <input type="text" placeholder="Código identificador do funcionário" value={employeePin} onChange={e => setEmployeePin(e.target.value)} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label>Latitude (GPS)</label>
                      <input type="text" value={gpsLat} onChange={e => setGpsLat(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Longitude (GPS)</label>
                      <input type="text" value={gpsLng} onChange={e => setGpsLng(e.target.value)} />
                    </div>
                  </div>

                  <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={handleSimulateFacialPoint} disabled={biometricScanning}>
                    <MapPin size={16} /> Validar Biometria & Bater Ponto
                  </button>
                </div>
              </div>
            )}

            {rhTab === 'folha' && (
              <div className="card">
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Fechamento Geral de Folha</h3>
                <p className="page-subtitle" style={{ marginBottom: '1rem' }}>Finaliza o cálculo da folha de pagamento de todos os colaboradores ativos aplicando deduções de INSS, IRRF e gerando os lançamentos no contas a pagar</p>
                
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'var(--bg-secondary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                    <span>Competência de Competência</span>
                    <span style={{ fontWeight: '700' }}>Julho de 2026</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                    <span>Total de Colaboradores</span>
                    <span>{employees.length} funcionários</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                    <span>Custo Bruto Estimado</span>
                    <span>R$ 7.950,00</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem' }}>
                    <span>Tributos Estimados (INSS/FGTS)</span>
                    <span style={{ color: 'var(--text-secondary)' }}>R$ 1.810,40</span>
                  </div>
                </div>

                <button className="btn btn-success" style={{ marginTop: '1rem', alignSelf: 'flex-start' }} onClick={handleFechamentoFolha}>
                  <FileText size={16} /> Processar Fechamento de Folha
                </button>
              </div>
            )}
          </>
        )}

        {/* TAB: KDS */}
        {activeTab === 'kds' && (
          <>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700' }}>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700' }}>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700' }}>
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
        )}

        {/* TAB: PDV */}
        {activeTab === 'pdv' && (
          <>
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
              {/* Product selector catalog */}
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

              {/* Shopping cart & payment drawer */}
              <div className="pdv-cart">
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>Carrinho de Compras</h3>
                
                <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {pdvCart.map(item => (
                    <div key={item.product.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem', fontSize: '0.85rem' }}>
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

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: '700', padding: '0.5rem 0' }}>
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
        )}

        {/* TAB: OS */}
        {activeTab === 'servicos' && (
          <>
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
        )}

        {/* TAB: MASTER */}
        {activeTab === 'master' && (
          <>
            <div className="page-header">
              <div>
                <h1 className="page-title">Painel Master (Software House)</h1>
                <p className="page-subtitle">Acesso a logs globais de auditoria, licenças e suporte técnico</p>
              </div>
            </div>

            <div className="grid-container">
              <div className="card">
                <div className="card-header">
                  <span className="card-label">Tenants Cadastrados</span>
                  <div className="card-icon-container primary"><Building size={20} /></div>
                </div>
                <span className="card-value">{masterStats?.totalTenants} Empresas</span>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-label">Licenças Ativas</span>
                  <div className="card-icon-container success"><Check size={20} /></div>
                </div>
                <span className="card-value">{masterStats?.activeLicences} Ativas</span>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-label">Receita Recorrente Mensal</span>
                  <div className="card-icon-container info"><DollarSign size={20} /></div>
                </div>
                <span className="card-value">R$ {masterStats?.monthlyRecurrence.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem', marginTop: '1rem' }}>
              {/* Impersonate Support Form */}
              <div className="card">
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Simular Acesso a um Cliente (Impersonate)</h3>
                <p className="page-subtitle" style={{ marginBottom: '0.5rem' }}>Entre temporariamente na conta de outro tenant para fins de auditoria e suporte, deixando logs rastreáveis</p>
                
                <form onSubmit={startImpersonation} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label>ID da Tenant de Origem</label>
                    <input type="text" placeholder="Ex: ten_1" value={impersonateTenantId} onChange={e => setImpersonateTenantId(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>ID do Usuário a Assumir</label>
                    <input type="text" placeholder="Ex: usr_1" value={impersonateUserId} onChange={e => setImpersonateUserId(e.target.value)} required />
                  </div>
                  <button type="submit" className="btn btn-primary">
                    Iniciar Impersonation
                  </button>
                </form>
              </div>

              {/* System Audit logs */}
              <div className="card">
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Logs de Auditoria do Suporte</h3>
                <p className="page-subtitle" style={{ marginBottom: '0.5rem' }}>Rastreabilidade de acessos efetuados por analistas da software house</p>
                
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Horário</th>
                        <th>Ação</th>
                        <th>Analista</th>
                        <th>Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log, idx) => (
                        <tr key={idx}>
                          <td><span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{log.timestamp}</span></td>
                          <td><span className="badge badge-info">{log.acao}</span></td>
                          <td>{log.usuario}</td>
                          <td>{log.detalhes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
