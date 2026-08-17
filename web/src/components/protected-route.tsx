import React from "react";
import { Navigate, useLocation } from "react-router-dom";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation();
  const token =
    localStorage.getItem("arcauth_token") ||
    localStorage.getItem("authx_token");

  if (!token) {
    // Redirect unauthenticated users to /login and preserve destination
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
