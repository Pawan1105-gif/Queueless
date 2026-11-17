import { useState } from "react";
import { ArrowLeft, ArrowRight, UserRoundPlus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { getErrorMessage } from "../services/api.js";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await register(values);
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-back" to="/"><ArrowLeft size={15} /> Back to QueueLess</Link>
        <span className="auth-icon"><UserRoundPlus size={21} /></span>
        <p className="eyebrow">Get started</p>
        <h1>Create your account</h1>
        <p className="auth-subtitle">One account for appointments, check-ins, and updates.</p>
        {error && <div className="form-alert" role="alert">{error}</div>}
        <form className="stack-form" onSubmit={submit}>
          <label>Full name<input autoComplete="name" required maxLength={160} value={values.full_name} onChange={(event) => setValues({ ...values, full_name: event.target.value })} /></label>
          <label>Email address<input type="email" autoComplete="email" required value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></label>
          <label>Phone number <span className="optional-label">Optional</span><input type="tel" autoComplete="tel" maxLength={32} value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} /></label>
          <label>Password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} /><small>Use at least 12 characters.</small></label>
          <button className="button button-primary form-submit" type="submit" disabled={busy}>
            {busy ? "Creating account…" : "Create account"} <ArrowRight size={17} />
          </button>
        </form>
        <p className="auth-switch">Already registered? <Link to="/login">Sign in</Link></p>
      </section>
    </main>
  );
}
