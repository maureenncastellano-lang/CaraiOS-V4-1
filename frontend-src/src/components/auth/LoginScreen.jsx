import React, { useState, useRef, useEffect } from "react";
import { Terminal, Loader, AlertCircle } from "lucide-react";
import useStore from "../../store/useStore";
import { login } from "../../services/api";
import "./LoginScreen.css";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const usernameRef = useRef(null);
  const setUser = useStore((s) => s.setUser);

  // Autofocus the first field on mount — standard expectation for a login
  // form, and meaningful for keyboard-only users specifically.
  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter both a username and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const user = await login(username.trim(), password);
      setUser(user);
    } catch (err) {
      // The backend's error text is already human-readable (see
      // api/routes/auth.py) — surfaced directly rather than a generic
      // "something went wrong" that would hide real information like
      // "invalid credentials" vs. a network failure.
      setError(err.message || "Login failed. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit} aria-label="Sign in to Agency OS">
        <div className="login-brand">
          <Terminal size={28} />
          <span>Agency OS</span>
        </div>
        <p className="login-subtitle">Sign in to continue</p>

        <label className="login-field">
          <span>Username</span>
          <input
            ref={usernameRef}
            type="text"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={submitting}
            required
          />
        </label>

        <label className="login-field">
          <span>Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            required
          />
        </label>

        {error && (
          <div className="login-error" role="alert" aria-live="polite">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" className="login-submit" disabled={submitting}>
          {submitting ? <Loader size={14} className="spin-slow" /> : null}
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
