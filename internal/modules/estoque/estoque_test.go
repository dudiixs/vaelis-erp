package estoque

import (
	"testing"
)

func TestValidarAlcadaAprovacao(t *testing.T) {
	tests := []struct {
		nome       string
		total      float64
		isMaster   bool
		esperaErro bool
	}{
		{"Abaixo do limite com usuário comum", 2500.00, false, false},
		{"Exatamente no limite com usuário comum", 5000.00, false, false},
		{"Acima do limite com usuário comum", 5000.01, false, true},
		{"Acima do limite com usuário Master", 15000.00, true, false},
	}

	for _, tt := range tests {
		permitido := true
		if tt.total > 5000.00 && !tt.isMaster {
			permitido = false
		}

		obteveErro := !permitido
		if obteveErro != tt.esperaErro {
			t.Errorf("Teste '%s' falhou: total=%.2f, isMaster=%t, obteveErro=%t, esperaErro=%t",
				tt.nome, tt.total, tt.isMaster, obteveErro, tt.esperaErro)
		}
	}
}
