import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { LandingHeader, LandingFooter } from "./LandingPage.jsx";
import { saveUser } from "../utils/auth.js";
import { apiErrorMessage, registerUser } from "../api/client.js";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [email,    setEmail]    = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]    = useState("");

  // Light client-side validation. The real validation will live on the backend
  // once /api/register exists; we just want to stop empty/obviously-bad submits.
  const emailLooksValid    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const usernameLooksValid = username.trim().length >= 3;
  const passwordLooksValid = password.length >= 8;
  const formValid          = emailLooksValid && usernameLooksValid && passwordLooksValid;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formValid) return;
    setError("");
    setSubmitting(true);
    try {
      const data = await registerUser({
        email: email.trim(),
        username: username.trim(),
        password,
      });
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

          <p className="section-eyebrow auth-eyebrow">Get started</p>
          <h1 className="auth-title">Create your BetWise account</h1>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {error ? <div className="error-msg" role="alert">{error}</div> : null}
            <div className="auth-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder="you@example.com"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                minLength={3}
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                placeholder="your_handle"
              />
              <p className="auth-hint">Public display name. Letters, numbers, underscores.</p>
            </div>

            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                placeholder="••••••••"
              />
              <p className="auth-hint">At least 8 characters.</p>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg auth-submit"
              disabled={submitting || !formValid}
            >
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="auth-aside">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
