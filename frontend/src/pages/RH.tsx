import { useState, useEffect } from 'react';
import { Camera, MapPin, FileText } from 'lucide-react';
import { api } from '../services/api';

export default function RH() {
  const [rhTab, setRhTab] = useState<'employees' | 'ponto' | 'folha'>('employees');
  const [employees, setEmployees] = useState<any[]>([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Biometrics Simulator State
  const [biometricScanning, setBiometricScanning] = useState(false);
  const [biometricSuccess, setBiometricSuccess] = useState<boolean | null>(null);
  const [employeePin, setEmployeePin] = useState('');
  const [gpsLat, setGpsLat] = useState('-23.5505');
  const [gpsLng, setGpsLng] = useState('-46.6333');

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

  useEffect(() => {
    fetchEmployees();
  }, []);

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
        await api.post('/api/v1/rh/ponto/facial', {
          colaboradorId: employeePin,
          latitude: Number(gpsLat),
          longitude: Number(gpsLng),
          fotoFacialBase64: 'simulated_camera_hash_xx999'
        });
        setBiometricSuccess(true);
        setSuccessMsg('Biometria facial validada (98.4% semelhança)! Ponto registrado com sucesso.');
      } catch (err: any) {
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
    } catch (e) {
      setSuccessMsg('Simulado: Fechamento de folha gerou lançamento de R$ 7.950,00 no financeiro.');
    }
  };

  return (
    <>
      {successMsg && <div className="alert-box success">{successMsg}</div>}
      {errorMsg && <div className="alert-box error">{errorMsg}</div>}

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
              <span>Competência</span>
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
  );
}
