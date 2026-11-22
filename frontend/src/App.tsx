import { useEffect, useState } from "react";
import Login from "./pages/Login";
import Shell from "./layouts/Shell";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import Inventory from "./pages/Inventory";
import Production from "./pages/Production";
import Reports from "./pages/Reports";
import Masters from "./pages/Masters";
import Payables from "./pages/Payables";
import Audit from "./pages/Audit";
import { ToastProvider, useToast } from "./components/Toast";
import { useHashRoute } from "./hooks/useHashRoute";
import { canAccess, navForRole } from "./lib/nav";
import { clearSession } from "./services/api";

type Session = { access_token?: string; role: string; username: string } | null;

function readSession(): Session {
  const token = localStorage.getItem("snackflow_token");
  if (!token) return null;
  return {
    access_token: token,
    role: localStorage.getItem("snackflow_role") || "",
    username: localStorage.getItem("snackflow_username") || "",
  };
}

function Workspace({ session, logout }: { session: NonNullable<Session>; logout: () => void }) {
  const { page, navigate } = useHashRoute();
  const role = session.role || localStorage.getItem("snackflow_role") || "";

  useEffect(() => {
    if (!canAccess(role, page)) navigate(navForRole(role)[0]?.key || "dashboard");
  }, [role, page]);

  return (
    <Shell page={page} setPage={navigate} role={role} username={session.username} logout={logout}>
      {page === "dashboard" && <Dashboard role={role} />}
      {page === "orders" && <Orders role={role} />}
      {page === "inventory" && <Inventory role={role} />}
      {page === "production" && <Production role={role} />}
      {page === "masters" && <Masters role={role} />}
      {page === "payables" && <Payables role={role} />}
      {page === "reports" && <Reports />}
      {page === "audit" && <Audit />}
    </Shell>
  );
}

function Root() {
  const toast = useToast();
  const [session, setSession] = useState<Session>(readSession);

  useEffect(() => {
    const onExpired = () => {
      setSession(null);
      toast.error("Your session expired. Please sign in again.");
    };
    window.addEventListener("snackflow:unauthorized", onExpired);
    return () => window.removeEventListener("snackflow:unauthorized", onExpired);
  }, [toast]);

  function login(data: any) {
    localStorage.setItem("snackflow_token", data.access_token);
    localStorage.setItem("snackflow_role", data.role);
    localStorage.setItem("snackflow_username", data.username);
    setSession({ access_token: data.access_token, role: data.role, username: data.username });
  }

  function logout() {
    clearSession();
    setSession(null);
    window.location.hash = "";
  }

  if (!session) return <Login onLogin={login} />;
  return <Workspace session={session} logout={logout} />;
}

export default function App() {
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  );
}
