package rh

import (
	"math"
	"strings"
	"testing"
)

func TestCalcularINSS(t *testing.T) {
	tests := []struct {
		salario  float64
		esperado float64
	}{
		{1000.00, 75.00},  // 7.5%
		{2000.00, 180.00}, // 9.0%
		{3500.00, 420.00}, // 12.0%
		{5000.00, 700.00}, // 14.0%
	}

	for _, tt := range tests {
		obtido := calcularINSS(tt.salario)
		if math.Abs(obtido-tt.esperado) > 0.001 {
			t.Errorf("calcularINSS(%.2f): esperado %.2f, obtido %.2f", tt.salario, tt.esperado, obtido)
		}
	}
}

func TestCalcularIRRF(t *testing.T) {
	tests := []struct {
		base     float64
		esperado float64
	}{
		{2000.00, 0.00},    // Isento
		{2500.00, 187.50},  // 7.5%
		{3500.00, 525.00},  // 15.0%
		{4500.00, 1012.50}, // 22.5%
		{5500.00, 1512.50}, // 27.5%
	}

	for _, tt := range tests {
		obtido := calcularIRRF(tt.base)
		if math.Abs(obtido-tt.esperado) > 0.001 {
			t.Errorf("calcularIRRF(%.2f): esperado %.2f, obtido %.2f", tt.base, tt.esperado, obtido)
		}
	}
}

func TestSimulacaoBiometriaFacial(t *testing.T) {
	tests := []struct {
		nome           string
		base64Imagem   string
		esperaSucesso  bool
		minSimilarity  float64
	}{
		{"Foto Válida / Reconhecida", "base64_data_of_clean_employee_face_shot", true, 90.0},
		{"Foto Inválida / Rejeitada", "base64_data_INVALIDO_bad_shot_of_face", false, 90.0},
	}

	for _, tt := range tests {
		similarity := 98.4
		if strings.Contains(strings.ToUpper(tt.base64Imagem), "INVALIDO") {
			similarity = 41.2
		}

		sucesso := similarity >= tt.minSimilarity
		if sucesso != tt.esperaSucesso {
			t.Errorf("Teste '%s' falhou: base64=%s, sucesso=%t, esperado=%t, similaridade=%.1f%%",
				tt.nome, tt.base64Imagem, sucesso, tt.esperaSucesso, similarity)
		}
	}
}
