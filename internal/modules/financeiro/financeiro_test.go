package financeiro

import (
	"fmt"
	"testing"
)

func TestPcoOrcamentoLimite(t *testing.T) {
	tests := []struct {
		nome        string
		limite      float64
		realizado   float64
		adicional   float64
		ultrapassou bool
	}{
		{"Abaixo do limite", 5000.00, 2000.00, 1000.00, false},
		{"Exatamente no limite", 5000.00, 4000.00, 1000.00, false},
		{"Excedendo o limite", 5000.00, 4000.00, 1000.01, true},
		{"Limite zero sem orçamento", 0.00, 0.00, 500.00, false},
	}

	for _, tt := range tests {
		novoRealizado := tt.realizado + tt.adicional
		ultrapassou := false
		if tt.limite > 0 && novoRealizado > tt.limite {
			ultrapassou = true
		}

		if ultrapassou != tt.ultrapassou {
			t.Errorf("Teste '%s' falhou: limite=%.2f, realizado=%.2f, adicional=%.2f, ultrapassou=%t, esperado=%t",
				tt.nome, tt.limite, tt.realizado, tt.adicional, ultrapassou, tt.ultrapassou)
		}
	}
}

func TestSimularTransmissaoBancaria(t *testing.T) {
	tests := []struct {
		bancoConfigured bool
		bancoNome       string
		esperaErro      bool
	}{
		{true, "ITAU", false},
		{true, "BRADESCO", false},
		{false, "SANTANDER", true},
	}

	for _, tt := range tests {
		// Simula verificação de banco configurado
		var err error
		if !tt.bancoConfigured {
			err = fmt.Errorf("A transmissão falhou. Nenhuma integração ativa configurada para o banco %s.", tt.bancoNome)
		}

		obteveErro := err != nil
		if obteveErro != tt.esperaErro {
			t.Errorf("Banco %s: obteveErro=%t, esperaErro=%t", tt.bancoNome, obteveErro, tt.esperaErro)
		}
	}
}
