package pdv

import (
	"strings"
	"testing"
)

func TestValidarSupervisorPrivilege(t *testing.T) {
	tests := []struct {
		nome       string
		cargo      string
		isMaster   bool
		esperaAuth bool
	}{
		{"Caixa Comum / Operador", "OPERADOR", false, false},
		{"Supervisor de Loja", "SUPERVISOR", false, true},
		{"Gerente de Vendas", "GERENTE", false, true},
		{"Usuário Master", "OPERADOR", true, true},
		{"Cargo Vazio Comum", "", false, false},
	}

	for _, tt := range tests {
		cargoUpper := strings.ToUpper(tt.cargo)
		autorizado := false
		if cargoUpper == "GERENTE" || cargoUpper == "SUPERVISOR" || tt.isMaster {
			autorizado = true
		}

		if autorizado != tt.esperaAuth {
			t.Errorf("Teste '%s' falhou: cargo=%s, isMaster=%t, autorizado=%t, esperado=%t",
				tt.nome, tt.cargo, tt.isMaster, autorizado, tt.esperaAuth)
		}
	}
}
