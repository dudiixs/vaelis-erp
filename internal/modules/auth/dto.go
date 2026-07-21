package auth

type RegisterRequest struct {
	RazaoSocial          string `json:"razao_social" xml:"razao_social" form:"razao_social"`
	CNPJ                 string `json:"cnpj" xml:"cnpj" form:"cnpj"`
	Nicho                string `json:"nicho" xml:"nicho" form:"nicho"`
	ModuloRH             bool   `json:"modulo_rh" xml:"modulo_rh" form:"modulo_rh"`
	ModuloKDS            bool   `json:"modulo_kds" xml:"modulo_kds" form:"modulo_kds"`
	ModuloMesasComandas  bool   `json:"modulo_mesas_comandas" xml:"modulo_mesas_comandas" form:"modulo_mesas_comandas"`
	ModuloOrdemServico   bool   `json:"modulo_ordem_servico" xml:"modulo_ordem_servico" form:"modulo_ordem_servico"`
	ModuloGradeProdutos  bool   `json:"modulo_grade_produtos" xml:"modulo_grade_produtos" form:"modulo_grade_produtos"`
	ModuloSelfCheckout   bool   `json:"modulo_self_checkout" xml:"modulo_self_checkout" form:"modulo_self_checkout"`
	NomeMaster           string `json:"nome_master" xml:"nome_master" form:"nome_master"`
	EmailMaster          string `json:"email_master" xml:"email_master" form:"email_master"`
	SenhaMaster          string `json:"senha_master" xml:"senha_master" form:"senha_master"`
}

type LoginRequest struct {
	Email string `json:"email" xml:"email" form:"email"`
	Senha string `json:"senha" xml:"senha" form:"senha"`
}

type UserResponse struct {
	ID       string `json:"id"`
	Nome     string `json:"nome"`
	Email    string `json:"email"`
	Cargo    string `json:"cargo"`
	IsMaster bool   `json:"is_master"`
}

type TenantResponse struct {
	ID          string `json:"id"`
	RazaoSocial string `json:"razao_social"`
	CNPJ        string `json:"cnpj"`
	Nicho       string `json:"nicho"`
}

type LoginResponse struct {
	Token  string         `json:"token"`
	User   UserResponse   `json:"user"`
	Tenant TenantResponse `json:"tenant"`
}

type SetPermissionRequest struct {
	UsuarioID      string `json:"usuario_id"`
	ModuloID       string `json:"modulo_id"`
	PodeVisualizar bool   `json:"pode_visualizar"`
	PodeCriar      bool   `json:"pode_criar"`
	PodeEditar     bool   `json:"pode_editar"`
	PodeDeletar    bool   `json:"pode_deletar"`
}
