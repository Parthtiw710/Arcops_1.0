package pkg

import (
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type clientLimit struct {
	tokens   float64
	lastSeen time.Time
}

var (
	clientsMu       sync.Mutex
	clients         = make(map[string]*clientLimit)
	rateLimitPerSec = 30.0
	rateBurst       = 60.0
)

func InitLimiter() {
	if limitStr := os.Getenv("RATE_LIMIT_PER_SEC"); limitStr != "" {
		if val, err := strconv.ParseFloat(limitStr, 64); err == nil {
			rateLimitPerSec = val
		}
	}
	if burstStr := os.Getenv("RATE_BURST"); burstStr != "" {
		if val, err := strconv.ParseFloat(burstStr, 64); err == nil {
			rateBurst = val
		}
	}
	go cleanupClients()
}

func getClientIdentifier(r *http.Request) string {
	if apiKey := r.Header.Get("X-DBMux-Key"); apiKey != "" {
		return "key:" + apiKey
	}
	if authHeader := r.Header.Get("Authorization"); strings.HasPrefix(authHeader, "Bearer ") {
		return "auth:" + strings.TrimPrefix(authHeader, "Bearer ")
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		ip = r.RemoteAddr
	}
	if ip == "127.0.0.1" || ip == "::1" || ip == "" {
		if cfIP := r.Header.Get("CF-Connecting-IP"); cfIP != "" {
			return "ip:" + strings.TrimSpace(cfIP)
		}
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			ips := strings.Split(xff, ",")
			return "ip:" + strings.TrimSpace(ips[0])
		}
	}
	return "ip:" + ip
}

func isRateLimited(r *http.Request) bool {
	key := getClientIdentifier(r)

	clientsMu.Lock()
	defer clientsMu.Unlock()

	now := time.Now()
	client, exists := clients[key]

	if !exists {
		clients[key] = &clientLimit{
			tokens:   rateBurst - 1.0,
			lastSeen: now,
		}
		return false
	}

	elapsed := now.Sub(client.lastSeen).Seconds()
	client.lastSeen = now
	client.tokens += elapsed * rateLimitPerSec
	if client.tokens > rateBurst {
		client.tokens = rateBurst
	}

	if client.tokens >= 1.0 {
		client.tokens -= 1.0
		return false
	}

	return true
}

func RateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isRateLimited(r) {
			w.Header().Set("Retry-After", "1")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":"Too Many Requests","message":"Rate limit exceeded. Please retry in 1 second."}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func cleanupClients() {
	for {
		time.Sleep(3 * time.Minute)
		clientsMu.Lock()
		for key, client := range clients {
			if time.Since(client.lastSeen) > 5*time.Minute {
				delete(clients, key)
			}
		}
		clientsMu.Unlock()
	}
}
