package token

import (
	"testing"

	"github.com/google/uuid"
)

func TestJWTService(t *testing.T) {
	secret := "test_secret_key_1234567890_test_secret"
	expiryHours := 1
	service := NewJWTService(secret, expiryHours)

	userID := uuid.New()
	tenantID := uuid.New()
	email := "test@example.com"
	isMaster := true

	// 1. Teste de Geração de Token
	tokenString, err := service.GenerateToken(userID, tenantID, email, isMaster)
	if err != nil {
		t.Fatalf("Erro ao gerar token: %v", err)
	}

	if tokenString == "" {
		t.Fatal("Token gerado está vazio")
	}

	// 2. Teste de Validação de Token Válido
	claims, err := service.ValidateToken(tokenString)
	if err != nil {
		t.Fatalf("Erro ao validar token: %v", err)
	}

	if claims.UserID != userID {
		t.Errorf("Esperado UserID %v, obtido %v", userID, claims.UserID)
	}

	if claims.TenantID != tenantID {
		t.Errorf("Esperado TenantID %v, obtido %v", tenantID, claims.TenantID)
	}

	if claims.Email != email {
		t.Errorf("Esperado Email %s, obtido %s", email, claims.Email)
	}

	if claims.IsMaster != isMaster {
		t.Errorf("Esperado IsMaster %t, obtido %t", isMaster, claims.IsMaster)
	}

	// 3. Teste de Validação com Chave Incorreta
	wrongService := NewJWTService("wrong_secret_key_9876543210_wrong", expiryHours)
	_, err = wrongService.ValidateToken(tokenString)
	if err == nil {
		t.Error("Esperava erro ao validar token com chave incorreta, mas obteve sucesso")
	}
}
