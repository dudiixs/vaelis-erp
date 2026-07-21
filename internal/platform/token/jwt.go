package token

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Claims struct {
	UserID         uuid.UUID `json:"user_id"`
	TenantID       uuid.UUID `json:"tenant_id"`
	Email          string    `json:"email"`
	IsMaster       bool      `json:"is_master"`
	ImpersonatorID string    `json:"impersonator_id,omitempty"`
	jwt.RegisteredClaims
}

type JWTService struct {
	secretKey   []byte
	expiryHours int
}

func NewJWTService(secret string, expiryHours int) *JWTService {
	return &JWTService{
		secretKey:   []byte(secret),
		expiryHours: expiryHours,
	}
}

func (j *JWTService) GenerateToken(userID, tenantID uuid.UUID, email string, isMaster bool) (string, error) {
	claims := &Claims{
		UserID:   userID,
		TenantID: tenantID,
		Email:    email,
		IsMaster: isMaster,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(j.expiryHours) * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "erp-core-api",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(j.secretKey)
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

func (j *JWTService) GenerateImpersonatedToken(userID, tenantID, impersonatorID uuid.UUID, email string) (string, error) {
	claims := &Claims{
		UserID:         userID,
		TenantID:       tenantID,
		Email:          email,
		IsMaster:       false,
		ImpersonatorID: impersonatorID.String(),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(j.expiryHours) * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "erp-core-api",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(j.secretKey)
}

func (j *JWTService) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("método de assinatura inválido")
		}
		return j.secretKey, nil
	})

	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("token inválido ou expirado")
	}

	return claims, nil
}
