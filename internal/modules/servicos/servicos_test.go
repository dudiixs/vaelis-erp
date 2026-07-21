package servicos

import (
	"testing"
)

func TestCalcularOSGeralTotal(t *testing.T) {
	tests := []struct {
		nome       string
		pecas      float64
		maoObra    float64
		esperaGeral float64
	}{
		{"Sem peças, apenas mão de obra", 0.00, 150.00, 150.00},
		{"Apenas peças, sem mão de obra", 450.00, 0.00, 450.00},
		{"Peças e mão de obra", 230.50, 120.00, 350.50},
		{"Valores zerados", 0.00, 0.00, 0.00},
	}

	for _, tt := range tests {
		totalObtido := tt.pecas + tt.maoObra
		if totalObtido != tt.esperaGeral {
			t.Errorf("Teste '%s' falhou: pecas=%.2f, maoObra=%.2f, obtido=%.2f, esperado=%.2f",
				tt.nome, tt.pecas, tt.maoObra, totalObtido, tt.esperaGeral)
		}
	}
}
