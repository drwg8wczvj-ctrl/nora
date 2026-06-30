import React, { useState } from "react";
import { supabase } from "./lib/supabase";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./App.css";

function pwStrength(pw) {
  if (!pw) return null;
  let s = 0;
  if (pw.length >= 6)  s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: 1, label: "Weak",        color: "#ef4444" };
  if (s === 2) return { score: 2, label: "Fair",        color: "#f97316" };
  if (s === 3) return { score: 3, label: "Good",        color: "#eab308" };
  if (s === 4) return { score: 4, label: "Strong",      color: "#22c55e" };
  return             { score: 5, label: "Very strong",  color: "#16a34a" };
}

// Earliest plausible birthday that won't break age display
const MIN_BIRTHDAY = "1920-01-01";
// Must be at least 10 years old
const maxBirthday = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 10);
  return d.toISOString().slice(0, 10);
};

export default function AuthScreen({ dark, glass }) {
  const { t } = useTranslation();
  const [mode,     setMode]     = useState("signin");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [name,     setName]     = useState("");
  const [birthday, setBirthday] = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [success,      setSuccess]      = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const switchMode = (m) => {
    setMode(m); setError(""); setSuccess("");
    setName(""); setBirthday("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name:     name.trim() || null,
              birthday: birthday    || null,
            },
          },
        });
        if (error) throw error;
        setSuccess(t("auth.accountCreated"));
        setMode("signin");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setSuccess(t("auth.resetSent"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // onAuthStateChange in App.js handles the rest
      }
    } catch (err) {
      if (err.message === "Load failed" || err.message === "Failed to fetch") {
        setError("Cannot reach Supabase — check that your project is active and the environment variables are set in Vercel.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`app${dark ? " dark" : ""}${glass ? " glass" : ""} auth-wrap`}>
      <div className="auth-card">

        <div className="auth-brand">
          <img
            src={dark ? "/logo-dark.png" : "/logo-light.png"}
            className="auth-brand-logo"
            alt="Nora" />
        </div>
        <p className="auth-tagline">{t("auth.tagline")}</p>

        {mode !== "forgot" && (
          <div className="auth-tabs">
            <button className={`auth-tab${mode === "signin" ? " active" : ""}`} onClick={() => switchMode("signin")}>
              {t("auth.signIn")}
            </button>
            <button className={`auth-tab${mode === "signup" ? " active" : ""}`} onClick={() => switchMode("signup")}>
              {t("auth.createAccount")}
            </button>
          </div>
        )}

        {mode === "forgot" && (
          <div className="auth-forgot-header">
            <p className="auth-forgot-title">{t("auth.resetTitle")}</p>
            <p className="auth-forgot-sub">{t("auth.resetSub")}</p>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            className="auth-input"
            type="email"
            placeholder={t("auth.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />

          {mode !== "forgot" && (() => {
            const strength = mode === "signup" ? pwStrength(password) : null;
            const strengthLabel = strength ? [null,
              t("auth.pwWeak"), t("auth.pwFair"), t("auth.pwGood"),
              t("auth.pwStrong"), t("auth.pwVeryStrong")
            ][strength.score] : null;
            return (
              <>
                <div className="auth-pw-wrap">
                  <input
                    className="auth-input"
                    type={showPassword ? "text" : "password"}
                    placeholder={mode === "signup" ? t("auth.passwordMinChars") : t("auth.password")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    className="auth-pw-eye"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {strength && (
                  <div className="auth-strength">
                    <div className="auth-strength-bar">
                      {[1,2,3,4,5].map((n) => (
                        <div
                          key={n}
                          className="auth-strength-seg"
                          style={{ background: n <= strength.score ? strength.color : undefined }}
                        />
                      ))}
                    </div>
                    <span className="auth-strength-label" style={{ color: strength.color }}>
                      {strengthLabel}
                    </span>
                  </div>
                )}
              </>
            );
          })()}

          {mode === "signin" && (
            <button
              type="button"
              className="auth-forgot-link"
              onClick={() => switchMode("forgot")}
            >
              {t("auth.forgotPassword")}
            </button>
          )}

          {mode === "signup" && (
            <>
              <input
                className="auth-input"
                type="text"
                placeholder={t("auth.yourName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <div className="auth-field">
                <label className="auth-field-label">{t("auth.birthday")}</label>
                <input
                  className="auth-input"
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  min={MIN_BIRTHDAY}
                  max={maxBirthday()}
                  required
                />
              </div>
            </>
          )}

          {error   && <p className="auth-msg auth-error">{error}</p>}
          {success && <p className="auth-msg auth-success">{success}</p>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? t("auth.loading") : mode === "signin" ? t("auth.signIn") : mode === "forgot" ? t("auth.sendResetLink") : t("auth.createAccount")}
          </button>

          {mode === "forgot" && (
            <button
              type="button"
              className="auth-back-link"
              onClick={() => switchMode("signin")}
            >
              {t("auth.backToSignIn")}
            </button>
          )}
        </form>

      </div>
    </div>
  );
}
