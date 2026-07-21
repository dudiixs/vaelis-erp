# Stage 1: Build the backend binary
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install git and certificates
RUN apk add --no-cache git ca-certificates

# Copy go mod and sum files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build application
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o erp-backend cmd/api/main.go

# Stage 2: Create a minimal release container
FROM alpine:latest

WORKDIR /app

# Copy ssl certs
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy binary from builder
COPY --from=builder /app/erp-backend .

# Copy default database configuration scripts
COPY --from=builder /app/db ./db

# Expose Fiber port
EXPOSE 8080

# Run entry point
CMD ["./erp-backend"]
