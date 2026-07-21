package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"erp/internal/platform/token"
)

func NewAuthMiddleware(jwtService *token.JWTService) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"erro": "Token de autenticação ausente",
			})
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"erro": "Formato de token inválido. Use 'Bearer <token>'",
			})
		}

		claims, err := jwtService.ValidateToken(parts[1])
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"erro": "Token inválido ou expirado",
			})
		}

		// Armazena as informações no contexto local do Fiber
		c.Locals("user_id", claims.UserID.String())
		c.Locals("tenant_id", claims.TenantID.String())
		c.Locals("email", claims.Email)
		c.Locals("is_master", claims.IsMaster)
		c.Locals("impersonator_id", claims.ImpersonatorID)

		return c.Next()
	}
}
