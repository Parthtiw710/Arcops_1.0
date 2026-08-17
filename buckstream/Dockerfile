# --- Build Stage ---
FROM golang:1.26-alpine AS builder

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -trimpath -o /buckstream ./cmd

# --- Run Stage ---
FROM scratch

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /buckstream /buckstream

EXPOSE 8083

ENTRYPOINT ["/buckstream"]
