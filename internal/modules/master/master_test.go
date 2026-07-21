package master

import (
	"testing"

	"github.com/google/uuid"
	"erp/internal/platform/token"
)

func TestGenerateImpersonatedTokenClaims(t *testing.T) {
	jwtService := token.NewJWTService("super-secret-test-key-of-32-bytes-length", 2)

	targetUserID := uuid.New()
	targetTenantID := uuid.New()
	impersonatorUserID := uuid.New()
	targetEmail := "cliente-suporte@empresa.com.br"

	tokenString, err := jwtService.GenerateImpersonatedToken(targetUserID, targetTenantID, impersonatorUserID, targetEmail)
	if err != nil {
		t.Fatalf("Erro ao gerar token impersonado: %v", err)
	}

	claims, err := jwtService.ValidateToken(tokenString)
	if err != nil {
		t.Fatalf("Erro ao validar token impersonado gerado: %v", err)
	}

	if claims.UserID != targetUserID {
		t.Errorf("Esperava UserID %s, obteve %s", targetUserID, claims.UserID)
	}
	if claims.TenantID != targetTenantID {
		t.Errorf("Esperava TenantID %s, obteve %s", targetTenantID, claims.TenantID)
	}
	if claims.ImpersonatorID != impersonatorUserID.String() {
		t.Errorf("Esperava ImpersonatorID %s, obteve %s", impersonatorUserID.String(), claims.ImpersonatorID)
	}
	if claims.Email != targetEmail {
		t.Errorf("Esperava Email %s, obteve %s", targetEmail, claims.Email)
	}
	if claims.IsMaster {
		t.Error("Sessão disfarçada (Impersonation) não deve herdar permissões globais de Master")
	}
}
