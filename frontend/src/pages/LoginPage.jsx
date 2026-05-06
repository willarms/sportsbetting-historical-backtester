import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

// LandingHeader / LandingFooter are exported here so we get the same public-
// facing shell as the marketing pages.
import { LandingHeader, LandingFooter } from "./LandingPage.jsx";
import { saveUser } from "../utils/auth.js";
import { apiErrorMessage, loginUser } from "../api/client.js";

export default function LoginPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password,   setPassword]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!identifier.trim() || !password) return;
    setError("");
    setSubmitting(true);
    try {
      const data = await loginUser({ identifier: identifier.trim(), password });
      saveUser(data);
      navigate("/backtest");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="landing">
      <LandingHeader />

      <section className="auth-section">
        <div className="auth-card">
          <img
            src="/lebron.avif"
            alt=""
            aria-hidden="true"
            className="auth-avatar"
          />

          <p className="section-eyebrow auth-eyebrow">Welcome back</p>
          <h1 className="auth-title">Log in to BetWise</h1>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {error ? <div className="error-msg" role="alert">{error}</div> : null}
            <div className="auth-field">
              <label htmlFor="identifier">Email or username</label>
              <input
                id="identifier"
                type="text"
                autoComplete="username"
                autoFocus
                required
                value={identifier}
                onChange={(e) => { setIdentifier(e.target.value); setError(""); }}
                placeholder="you@example.com"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg auth-submit"
              disabled={submitting || !identifier.trim() || !password}
            >
              {submitting ? "Logging in…" : "Log in"}
            </button>
          </form>

          <p className="auth-aside">
            Don't have an account? <Link to="/register">Sign up</Link>
          </p>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
