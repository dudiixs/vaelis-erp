package kds

import (
	"testing"
)

func TestCalcularComandaNovoTotal(t *testing.T) {
	tests := []struct {
		nome        string
		totalAtual  float64
		quantidade  int
		precoUnit   float64
		esperaTotal float64
	}{
		{"Adição inicial na mesa vazia", 0.00, 3, 12.50, 37.50},
		{"Adição secundária com saldo existente", 50.00, 2, 15.00, 80.00},
		{"Adição de item zerado", 120.00, 0, 9.90, 120.00},
	}

	for _, tt := range tests {
		novoTotal := tt.totalAtual + (float64(tt.quantidade) * tt.precoUnit)
		if novoTotal != tt.esperaTotal {
			t.Errorf("Teste '%s' falhou: totalAtual=%.2f, quant=%d, precoUnit=%.2f, obtido=%.2f, esperado=%.2f",
				tt.nome, tt.totalAtual, tt.quantidade, tt.precoUnit, novoTotal, tt.esperaTotal)
		}
	}
}
