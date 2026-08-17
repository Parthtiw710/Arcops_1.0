package pkg

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
)

func CreateReverseProxy(targetURLStr string) (http.Handler, error) {
	target, err := url.Parse(targetURLStr)
	if err != nil {
		return nil, fmt.Errorf("invalid target URL %s: %w", targetURLStr, err)
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		clientHost := req.Host
		originalDirector(req)
		if clientHost != "" {
			req.Header.Set("X-Forwarded-Host", clientHost)
		}
		req.Host = target.Host

		if req.Header.Get("Authorization") == "" {
			if cookie, err := req.Cookie("authx_session"); err == nil && cookie.Value != "" {
				req.Header.Set("Authorization", "Bearer "+cookie.Value)
			} else if cookie, err := req.Cookie("arcauth_session"); err == nil && cookie.Value != "" {
				req.Header.Set("Authorization", "Bearer "+cookie.Value)
			}
		}
	}
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Del("Access-Control-Allow-Origin")
		resp.Header.Del("Access-Control-Allow-Credentials")
		resp.Header.Del("Access-Control-Allow-Methods")
		resp.Header.Del("Access-Control-Allow-Headers")
		return nil
	}
	return proxy, nil
}

func CreateBuckStreamProxy(cfg GatewayConfig) (http.Handler, error) {
	return CreateReverseProxy(cfg.BuckStreamURL)
}
