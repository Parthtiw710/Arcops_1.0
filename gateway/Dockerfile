FROM golang:1.26-alpine AS builder

RUN apk add --no-cache ca-certificates && rm -rf /var/cache/apk/*

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /gateway-server ./cmd/server

FROM scratch

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /gateway-server /gateway-server

EXPOSE 8000
ENTRYPOINT ["/gateway-server"]
