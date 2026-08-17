/**
 * ArcAuth SDK Client - Connects to Central Gateway (:8000/api/auth)
 */

import { GATEWAY_URL } from "../config";

export interface AuthUser {
  id: string;
  email: string;
  mobile?: string;
  full_name?: string;
  avatar_url?: string;
  team_id?: string;
  plan_tier?: number;
  created_at?: string;
}

export interface AuthResponse {
  message: string;
  token?: string;
  user?: AuthUser;
  is_new_user?: boolean;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`Auth request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export class ArcAuthClient {
  private baseUrl: string;

  constructor(baseUrl = GATEWAY_URL) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    const raw = localStorage.getItem("arcauth_token") || localStorage.getItem("authx_token");
    if (!raw) return null;
    return raw.replace(/^Bearer\s+/i, "").trim();
  }

  // Unified Authentication (Email/Password, OTP, OAuth)
  async authenticate(payload: {
    email?: string;
    password?: string;
    method?: "password" | "otp" | "magic_link";
    target?: string;
    code?: string;
    full_name?: string;
  }): Promise<AuthResponse> {
    const res = await fetchWithTimeout(`${this.baseUrl}/api/auth/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || "Authentication failed");
    }

    if (data.token) {
      localStorage.setItem("arcauth_token", data.token);
      localStorage.setItem("authx_token", data.token);
      if (data.user) {
        localStorage.setItem("arcauth_user", JSON.stringify(data.user));
        localStorage.setItem("authx_user", JSON.stringify(data.user));
      }
      window.dispatchEvent(new Event("arcauth_login_success"));
      window.dispatchEvent(new Event("authx_login_success"));
    }

    return data;
  }

  // Send Email or Mobile SMS OTP
  async sendOTP(target: string, type: "email" | "sms"): Promise<{ message: string; mock_otp?: string }> {
    const res = await fetchWithTimeout(`${this.baseUrl}/api/auth/otp/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ target, type }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || "Failed to send OTP");
    }
    return data;
  }

  // Send Magic Link Email
  async sendMagicLink(email: string): Promise<{ message: string; magic_url?: string; token?: string }> {
    const res = await fetchWithTimeout(`${this.baseUrl}/api/auth/magic-link/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || "Failed to send Magic Link");
    }
    return data;
  }

  // Get Current Authenticated Profile
  async getMe(): Promise<AuthUser> {
    const token = this.getToken();
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/api/auth/me`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) {
        this.logout();
        throw new Error(data.message || data.error || "Unauthorized");
      }
      return data.user || data;
    } catch (err) {
      this.logout();
      throw err;
    }
  }

  // Create API Key
  async createAPIKey(name: string): Promise<{ id: string; key: string; name: string; key_prefix: string }> {
    const token = this.getToken();
    const res = await fetchWithTimeout(`${this.baseUrl}/api/auth/keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: "include",
      body: JSON.stringify({ name }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || "Failed to create API key");
    }
    return data;
  }

  // List API Keys
  async listAPIKeys(): Promise<any[]> {
    const token = this.getToken();
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/api/auth/keys`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
      });

      if (!res.ok) {
        return [];
      }
      const data = await res.json();
      return data.keys || data;
    } catch {
      return [];
    }
  }

  // Delete API Key
  async deleteAPIKey(id: string): Promise<void> {
    const token = this.getToken();
    await fetchWithTimeout(`${this.baseUrl}/api/auth/keys?id=${id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: "include",
    });
  }

  // Logout
  logout(): void {
    localStorage.removeItem("arcauth_token");
    localStorage.removeItem("authx_token");
    localStorage.removeItem("arcauth_user");
    localStorage.removeItem("authx_user");
    document.cookie = "authx_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    window.dispatchEvent(new Event("arcauth_logout"));
    window.dispatchEvent(new Event("authx_logout"));
  }
}

export const arcauth = new ArcAuthClient();
export const authx = arcauth;
export const AuthXClient = ArcAuthClient;
