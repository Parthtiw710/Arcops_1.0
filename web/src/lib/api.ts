import { GATEWAY_URL } from '../config';

export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${GATEWAY_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  
  const rawToken = (typeof localStorage !== "undefined" && (localStorage.getItem("arcauth_token") || localStorage.getItem("authx_token"))) || "";
  const cleanToken = rawToken.replace(/^Bearer\s+/i, "").trim();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(cleanToken ? { 'Authorization': `Bearer ${cleanToken}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `API Error ${response.status}: ${response.statusText}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error || errorJson.message || errorMessage;
    } catch {
      // Fallback
    }
    throw new Error(errorMessage);
  }

  return response.json();
}
