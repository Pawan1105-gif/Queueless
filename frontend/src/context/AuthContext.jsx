import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../services/api.js";

const AuthContext = createContext(null);

function readSavedUser() {
  try {
    return JSON.parse(localStorage.getItem("queueless.user") || "null");
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSavedUser);
  const [ready, setReady] = useState(() => !localStorage.getItem("queueless.accessToken"));

  const clearSession = useCallback(() => {
    localStorage.removeItem("queueless.accessToken");
    localStorage.removeItem("queueless.user");
    setUser(null);
    setReady(true);
  }, []);

  useEffect(() => {
    const handleExpired = () => clearSession();
    window.addEventListener("queueless:auth-expired", handleExpired);
    return () => window.removeEventListener("queueless:auth-expired", handleExpired);
  }, [clearSession]);

  useEffect(() => {
    if (!localStorage.getItem("queueless.accessToken")) {
      setReady(true);
      return;
    }
    api.get("/auth/me")
      .then(({ data }) => {
        setUser(data);
        localStorage.setItem("queueless.user", JSON.stringify(data));
      })
      .catch((error) => {
        if (error.response?.status === 401) clearSession();
      })
      .finally(() => setReady(true));
  }, [clearSession]);

  const acceptSession = useCallback((data) => {
    localStorage.setItem("queueless.accessToken", data.access_token);
    localStorage.setItem("queueless.user", JSON.stringify(data.user));
    setUser(data.user);
    setReady(true);
    return data.user;
  }, []);

  const login = useCallback(async (credentials, accountType = "personal") => {
    const { data } = await api.post("/auth/login", credentials);
    if (accountType === "organization" && data.user.role !== "organization_admin") {
      throw new Error("This is not an organization administrator account. Use the account that created or manages the organization.");
    }
    if (accountType === "super_admin" && data.user.role !== "super_admin") {
      throw new Error("This is not a Super Admin account. Choose the sign-in option that matches your account.");
    }
    if (accountType === "personal" && data.user.role === "organization_admin") {
      throw new Error("Use the Organization sign-in option for this account.");
    }
    return acceptSession(data);
  }, [acceptSession]);

  const register = useCallback(async (profile) => {
    const { data } = await api.post("/auth/register", profile);
    return acceptSession(data);
  }, [acceptSession]);

  const refreshUser = useCallback(async () => {
    const { data } = await api.get("/auth/me");
    setUser(data);
    localStorage.setItem("queueless.user", JSON.stringify(data));
    return data;
  }, []);

  const logout = useCallback(async () => {
    clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({ user, ready, login, register, logout, refreshUser }),
    [user, ready, login, register, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
