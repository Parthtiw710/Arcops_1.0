FROM golang:1.26-alpine AS builder

RUN apk --no-cache add ca-certificates && rm -rf /var/cache/apk/*

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /frontedge ./cmd/server

FROM scratch

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /frontedge /frontedge

EXPOSE 8084
ENTRYPOINT ["/frontedge"]
