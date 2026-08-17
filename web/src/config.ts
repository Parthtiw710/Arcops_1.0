/**
 * Centralized Application Gateway Configuration
 * All API clients and UI components import GATEWAY_URL from this single file.
 */
export const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || "http://localhost:8000";
