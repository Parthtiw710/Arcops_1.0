# =============================================================================
# Stage 1: Builder — Downloads deps and compiles the dbmux binary
# =============================================================================
FROM golang:1.26-alpine AS builder

# Install CA certificates to embed into the scratch image
RUN apk add --no-cache ca-certificates

WORKDIR /build

# Copy go module files first for Docker layer caching
COPY go.mod go.sum ./
RUN go mod download

# Copy full source
COPY . .

# Build a fully static binary — no libc, no dependencies
# CGO_ENABLED=0: pure Go binary (libsql uses wazero WASM runtime, no CGO needed)
# -ldflags="-s -w": strip debug symbols and DWARF info → smallest possible binary
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -trimpath \
    -o /dbmux-server \
    ./cmd/server

# =============================================================================
# Stage 2: Runtime — Absolute minimal scratch (zero OS, just the binary)
# =============================================================================
FROM scratch

# Copy CA certificates from builder (needed for TLS connections to cloud DBs)
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy only the statically compiled binary
COPY --from=builder /dbmux-server /dbmux-server

# DBMux ConnectRPC Gateway port
EXPOSE 8082

ENTRYPOINT ["/dbmux-server"]
