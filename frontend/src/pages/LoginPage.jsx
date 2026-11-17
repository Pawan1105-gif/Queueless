import { useState } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import api, { apiRootUrl, getErrorMessage } from "../services/api.js";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ email: "", password: "" });
  const [accountType, setAccountType] = useState("personal");
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const accountLabels = {
    personal: "Customer",
    organization: "Organization",
    super_admin: "Super Admin",
  };

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(values, accountType);
      navigate(accountType === "personal" ? location.state?.from || "/dashboard" : "/dashboard", { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function fillDemo(event) {
    event.preventDefault();
    setError("");
    setConnectionStatus("");
    try {
      const { data } = await api.get(`${apiRootUrl}/health/db`);
      if (data.status !== "Connected") setError("Database is not connected.");
      else setConnectionStatus("API and PostgreSQL are connected.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-back" to="/"><ArrowLeft size={15} /> Back to QueueLess</Link>
        <span className="auth-icon"><LockKeyhole size={21} /></span>
        <p className="eyebrow">
          {accountType === "organization"
            ? "Organization portal"
            : accountType === "super_admin" ? "Platform administration" : "Welcome back"}
        </p>
        <h1>
          {accountType === "organization"
            ? "Organization sign in"
            : accountType === "super_admin" ? "Super Admin sign in" : "Sign in to QueueLess"}
        </h1>
        <p className="auth-subtitle">
          {accountType === "organization"
            ? "Sign in with the administrator account that created or manages your organization."
            : accountType === "super_admin"
              ? "Restricted sign-in for the QueueLess platform administrator."
              : "Sign in to manage your profile, appointments, and QueueLess services."}
        </p>
        <div className="auth-account-tabs" role="tablist" aria-label="Choose sign-in type">
          {Object.entries(accountLabels).map(([type, label]) => (
            <button
              aria-selected={accountType === type}
              className={accountType === type ? "is-selected" : ""}
              id={`${type}-login-tab`}
              key={type}
              onClick={() => { setAccountType(type); setError(""); setConnectionStatus(""); }}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {error && <div className="form-alert" role="alert">{error}</div>}
        <form className="stack-form" onSubmit={submit} aria-labelledby={`${accountType}-login-tab`}>
          <label>Email address<input type="email" autoComplete="email" required value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></label>
          <label>Password<input type="password" autoComplete="current-password" required value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} /></label>
          <button className="button button-primary form-submit" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"} <ArrowRight size={17} />
          </button>
        </form>
        {accountType === "personal" ? (
          <p className="auth-switch">New to QueueLess? <Link to="/register">Create an account</Link></p>
        ) : accountType === "organization" ? (
          <p className="auth-switch">Need an organization account? <Link to="/register">Create a personal account</Link>, then submit an organization application from your dashboard.</p>
        ) : <p className="auth-switch">Super Admin access is provisioned separately and cannot be self-registered.</p>}
        <button className="text-button" type="button" onClick={fillDemo}>Check API and database connection</button>
        {connectionStatus && <p className="connection-status" role="status">{connectionStatus}</p>}
      </section>
    </main>
  );
}
