package auth

import (
	"context"
	"testing"

	"connectrpc.com/connect"
)

type dummyReq struct{}

func TestAuthInterceptor_ServiceRoleKey(t *testing.T) {
	anonKey := "anon_123"
	serviceKey := "service_secret_456"
	jwtSecret := "secret_789"

	interceptor := NewAuthInterceptor(anonKey, serviceKey, jwtSecret)

	nextHandler := func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		authCtx := AuthFromContext(ctx)
		if authCtx == nil {
			t.Fatalf("expected AuthContext in context")
		}
		if !authCtx.IsAdmin {
			t.Errorf("expected IsAdmin == true for service role key")
		}
		return connect.NewResponse(&dummyReq{}), nil
	}

	req := connect.NewRequest(&dummyReq{})
	req.Header().Set("X-Service-Role-Key", serviceKey)

	_, err := interceptor(nextHandler)(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestAuthInterceptor_AnonKeyWithJWT(t *testing.T) {
	anonKey := "anon_123"
	serviceKey := "service_secret_456"
	jwtSecret := "secret_789"

	interceptor := NewAuthInterceptor(anonKey, serviceKey, jwtSecret)

	nextHandler := func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		authCtx := AuthFromContext(ctx)
		if authCtx == nil {
			t.Fatalf("expected AuthContext in context")
		}
		if authCtx.IsAdmin {
			t.Errorf("expected IsAdmin == false for anon key")
		}
		return connect.NewResponse(&dummyReq{}), nil
	}

	req := connect.NewRequest(&dummyReq{})
	req.Header().Set("X-Anon-Key", anonKey)

	_, err := interceptor(nextHandler)(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestAuthInterceptor_InvalidKey(t *testing.T) {
	anonKey := "anon_123"
	serviceKey := "service_secret_456"
	jwtSecret := "secret_789"

	interceptor := NewAuthInterceptor(anonKey, serviceKey, jwtSecret)

	nextHandler := func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		return connect.NewResponse(&dummyReq{}), nil
	}

	req := connect.NewRequest(&dummyReq{})
	req.Header().Set("X-Anon-Key", "invalid_key")

	_, err := interceptor(nextHandler)(context.Background(), req)
	if err == nil {
		t.Fatalf("expected error for invalid API key")
	}

	if connect.CodeOf(err) != connect.CodeUnauthenticated {
		t.Errorf("expected CodeUnauthenticated error, got %v", connect.CodeOf(err))
	}
}
