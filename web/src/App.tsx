import React, { Suspense, lazy, useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { LenisProvider } from "@/components/lenis-provider";
import { SqlDrawer } from "@/components/sql-drawer";
import { ProtectedRoute } from "@/components/protected-route";
import { arcauth } from "@/lib/arcauth";

const LandingPage = lazy(() => import("@/components/landing-page").then((m) => ({ default: m.LandingPage })));
const DashboardBento = lazy(() => import("@/components/dashboard-bento").then((m) => ({ default: m.DashboardBento })));
const TablesPage = lazy(() => import("@/components/tables-page").then((m) => ({ default: m.TablesPage })));
const SchemaVisualizerPage = lazy(() => import("@/components/schema-visualizer").then((m) => ({ default: m.SchemaVisualizerPage })));
const BuckStreamPage = lazy(() => import("@/components/buckstream-page").then((m) => ({ default: m.BuckStreamPage })));
const DBMuxPage = lazy(() => import("@/components/dbmux-page").then((m) => ({ default: m.DBMuxPage })));
const ArcAuthPage = lazy(() => import("@/components/arcauth-page").then((m) => ({ default: m.ArcAuthPage })));
const LoginPage = lazy(() => import("@/components/login-page").then((m) => ({ default: m.LoginPage })));
const FrontedgeConsolePage = lazy(() => import("@/components/frontedge-console").then((m) => ({ default: m.FrontedgeConsolePage })));
const FrontedgePage = lazy(() => import("@/components/frontedge-page").then((m) => ({ default: m.FrontedgePage })));
const ErrorPage = lazy(() => import("@/components/error-page").then((m) => ({ default: m.ErrorPage })));

export default function App() {
  const [isSqlDrawerOpen, setIsSqlDrawerOpen] = useState(false);

  // Perform session hydration handshake & URL token extraction on page mount
  useEffect(() => {
    const syncSessionWithBackend = async () => {
      // 0. Immediately logout if navigating to /login
      if (window.location.pathname === "/login") {
        arcauth.logout();
        return;
      }

      // 1. Extract token/user from URL query parameters (OAuth Redirect Callbacks)
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("token");
      const urlUser = params.get("user");

      if (urlToken) {
        localStorage.setItem("arcauth_token", urlToken);
        localStorage.setItem("authx_token", urlToken);
        if (urlUser) {
          try {
            const decodedUser = JSON.parse(decodeURIComponent(urlUser));
            localStorage.setItem("arcauth_user", JSON.stringify(decodedUser));
            localStorage.setItem("authx_user", JSON.stringify(decodedUser));
          } catch { }
        }
        // Clean URL params after saving to localStorage
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      // 2. Hydrate session from localStorage
      const storedUser = localStorage.getItem("arcauth_user") || localStorage.getItem("authx_user");
      const token = localStorage.getItem("arcauth_token") || localStorage.getItem("authx_token");

      if (storedUser || token) {
        try {
          const verifiedUser = await arcauth.getMe();
          if (verifiedUser) {
            localStorage.setItem("arcauth_user", JSON.stringify(verifiedUser));
            localStorage.setItem("authx_user", JSON.stringify(verifiedUser));
            window.dispatchEvent(new Event("arcauth_login_success"));
            window.dispatchEvent(new Event("authx_login_success"));
          }
        } catch (err: any) {
          // Only log out if explicit 401 Unauthorized from server
          if (err?.status === 401) {
            arcauth.logout();
          }
        }
      }
    };

    syncSessionWithBackend();
  }, []);

  useEffect(() => {
    const handleOpen = () => setIsSqlDrawerOpen(true);
    window.addEventListener("open_sql_drawer", handleOpen);
    return () => window.removeEventListener("open_sql_drawer", handleOpen);
  }, []);

  return (
    <LenisProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-background text-foreground flex flex-col relative">
          <Navbar />
          <main className="flex-1 min-h-0">
            <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh] text-muted-foreground font-mono text-sm">Loading...</div>}>
              <Routes>
                {/* Public Landing Page */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/error" element={<ErrorPage />} />
                {/* Protected Workspace Routes */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <DashboardBento />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tables"
                  element={
                    <ProtectedRoute>
                      <TablesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/schema-visualizer"
                  element={
                    <ProtectedRoute>
                      <SchemaVisualizerPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="/buckstream" element={<BuckStreamPage />} />
                <Route path="/dbmux" element={<DBMuxPage />} />
                <Route path="/arcauth" element={<ArcAuthPage />} />
                <Route path="/frontedge" element={<FrontedgePage />} />
                <Route path="/frontedge-console" element={<ProtectedRoute><FrontedgeConsolePage /></ProtectedRoute>} />
                <Route path="/frontedge-console/new" element={<ProtectedRoute><FrontedgeConsolePage /></ProtectedRoute>} />
                <Route path="/frontedge-console/project/:projectName" element={<ProtectedRoute><FrontedgeConsolePage /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
          <SqlDrawer
            isOpen={isSqlDrawerOpen}
            onClose={() => setIsSqlDrawerOpen(false)}
          />
        </div>
      </BrowserRouter>
    </LenisProvider>
  );
}
