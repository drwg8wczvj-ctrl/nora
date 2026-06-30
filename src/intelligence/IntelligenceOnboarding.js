import React, { useState } from "react";
import { X, CheckCircle, Sparkles } from "lucide-react";

const STEPS = ["welcome", "gmail", "telegram", "done"];
const TOTAL  = STEPS.length - 1; // exclude done from progress dots

const TELEGRAM_BOT   = "https://t.me/NoraAssistantTelegramm_bot";

export default function IntelligenceOnboarding({
  onClose,
  onConnectGmail,
  onConnectTelegramPhone,
  onVerifyTelegramCode,
  hasGmail,
  hasTelegram,
  markOnboarded,
}) {
  const [step, setStep] = useState(0);

  // Telegram auth state
  const [tgPhase, setTgPhase]     = useState("phone"); // "phone" | "code" | "2fa" | "done"
  const [phone, setPhone]         = useState("");
  const [code, setCode]           = useState("");
  const [tgPassword, setTgPassword] = useState("");
  const [tgBusy, setTgBusy]       = useState(false);
  const [tgError, setTgError]     = useState("");
  const [tgName, setTgName]       = useState("");

  const stepKey = STEPS[step];

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else finish();
  };
  const finish = () => {
    markOnboarded?.();
    onClose();
  };

  const handleSendCode = async () => {
    if (!phone.trim()) return;
    setTgBusy(true);
    setTgError("");
    const result = await onConnectTelegramPhone(phone.trim());
    setTgBusy(false);
    if (result?.ok) {
      setTgPhase("code");
    } else {
      setTgError(result?.error ?? "Could not send code. Check the phone number format (+1234567890).");
    }
  };

  const handleVerifyCode = async () => {
    if (!code.trim()) return;
    setTgBusy(true);
    setTgError("");
    const result = await onVerifyTelegramCode(code.trim());
    setTgBusy(false);
    if (result?.ok) {
      setTgName(result.displayName ?? "");
      setTgPhase("done");
      setTimeout(next, 1400);
    } else if (result?.needs2fa) {
      setTgPhase("2fa");
    } else {
      setTgError(result?.error ?? "Incorrect code. Check your Telegram app.");
    }
  };

  const handleVerify2fa = async () => {
    if (!tgPassword.trim()) return;
    setTgBusy(true);
    setTgError("");
    const result = await onVerifyTelegramCode(code.trim(), tgPassword.trim());
    setTgBusy(false);
    if (result?.ok) {
      setTgName(result.displayName ?? "");
      setTgPhase("done");
      setTimeout(next, 1400);
    } else {
      setTgError(result?.error ?? "Wrong password.");
    }
  };

  return (
    <>
      <div className="intel-overlay-mask" onClick={onClose} />
      <div className="intel-onboarding-wrap" onClick={(e) => e.stopPropagation()}>
        <div className="intel-onboarding-modal">
          <button className="ob-close" onClick={onClose} aria-label="Close"><X size={14} /></button>

          {/* Progress dots (skip "done" step) */}
          {stepKey !== "done" && (
            <div className="ob-progress">
              {STEPS.slice(0, TOTAL).map((s, i) => (
                <div
                  key={s}
                  className={`ob-progress-dot ${i === step ? "active" : i < step ? "complete" : ""}`}
                />
              ))}
            </div>
          )}

          {/* ── STEP: welcome ─────────────────────────────────── */}
          {stepKey === "welcome" && (
            <>
              <div className="ob-hero">
                <div className="ob-hero-orb">
                  <Sparkles size={28} color="#fff" />
                </div>
                <h1>Meet NORA Intelligence</h1>
                <p>
                  Connect your inbox and messaging apps. NORA will automatically
                  detect appointments, deadlines, and reservations — and ask
                  before adding anything to your planner.
                </p>
              </div>

              <div className="ob-features">
                {[
                  { icon: "📅", title: "Appointment detection", desc: "Doctor visits, meetings, calls" },
                  { icon: "✈️", title: "Travel recognition",    desc: "Flights, hotels, itineraries" },
                  { icon: "🍽️", title: "Reservation parsing",  desc: "Restaurants, events, tickets" },
                  { icon: "⏰", title: "Deadline extraction",   desc: "Due dates, submission windows" },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="ob-feature">
                    <div className="ob-feature-icon">{icon}</div>
                    <div className="ob-feature-text">
                      <strong>{title}</strong>
                      <span>{desc}</span>
                    </div>
                  </div>
                ))}
              </div>

              <button className="ob-cta" onClick={next}>Get started</button>
              <button className="ob-skip" onClick={finish}>Maybe later</button>
            </>
          )}

          {/* ── STEP: gmail ───────────────────────────────────── */}
          {stepKey === "gmail" && (
            <>
              <div className="ob-connect-hero">
                <div className="ob-connect-icon-wrap gmail">📧</div>
                <h2>Connect Gmail</h2>
                <p>
                  NORA reads your recent emails to detect reservations, flight
                  confirmations, deadlines, and more — and surfaces them as
                  suggestions for you to approve.
                </p>
              </div>

              {hasGmail ? (
                <button className="ob-connect-btn connected" disabled>
                  <CheckCircle size={18} />
                  Gmail Connected
                </button>
              ) : (
                <button className="ob-connect-btn gmail" onClick={onConnectGmail}>
                  <span>G</span>
                  Connect with Google
                </button>
              )}

              <div style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                fontSize: 12,
                color: "var(--text-muted)",
                lineHeight: 1.5,
                marginBottom: 16,
              }}>
                🔒 NORA only reads emails — never sends, modifies, or deletes anything.
                You can disconnect at any time.
              </div>

              <button className="ob-cta" onClick={next}>
                {hasGmail ? "Continue" : "Skip for now"}
              </button>
            </>
          )}

          {/* ── STEP: telegram ────────────────────────────────── */}
          {stepKey === "telegram" && (
            <>
              <div className="ob-connect-hero">
                <div className="ob-connect-icon-wrap telegram">✈️</div>
                <h2>Connect Telegram</h2>
                <p>
                  NORA reads your recent messages automatically and surfaces
                  appointments, deadlines, and reservations — you just review
                  and approve.
                </p>
              </div>

              {hasTelegram || tgPhase === "done" ? (
                <button className="ob-connect-btn connected" disabled>
                  <CheckCircle size={18} />
                  Telegram Connected{tgName ? ` · ${tgName}` : ""}
                </button>
              ) : (
                <div className="ob-telegram-steps">

                  {/* Phone input */}
                  {tgPhase === "phone" && (
                    <>
                      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>
                        Enter your Telegram phone number. NORA will send you a verification code via Telegram.
                      </p>
                      <div className="ob-link-code-input">
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => { setPhone(e.target.value); setTgError(""); }}
                          placeholder="+1 234 567 8900"
                          onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                          autoFocus
                        />
                        <button onClick={handleSendCode} disabled={tgBusy || !phone.trim()}>
                          {tgBusy ? "Sending…" : "Send code"}
                        </button>
                      </div>
                      <p style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
                        Include country code, e.g. +49 for Germany
                      </p>
                    </>
                  )}

                  {/* OTP input */}
                  {tgPhase === "code" && (
                    <>
                      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>
                        Check your Telegram app — a code was just sent to{" "}
                        <strong>{phone}</strong>.
                      </p>
                      <div className="ob-link-code-input">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={code}
                          onChange={(e) => { setCode(e.target.value); setTgError(""); }}
                          placeholder="12345"
                          maxLength={10}
                          onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
                          autoFocus
                        />
                        <button onClick={handleVerifyCode} disabled={tgBusy || !code.trim()}>
                          {tgBusy ? "Verifying…" : "Verify"}
                        </button>
                      </div>
                      <button
                        style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", marginTop: 6, padding: 0 }}
                        onClick={() => { setTgPhase("phone"); setCode(""); setTgError(""); }}
                      >
                        ← Use a different number
                      </button>
                    </>
                  )}

                  {/* 2FA password */}
                  {tgPhase === "2fa" && (
                    <>
                      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>
                        Your account has two-step verification enabled. Enter your Telegram cloud password.
                      </p>
                      <div className="ob-link-code-input">
                        <input
                          type="password"
                          value={tgPassword}
                          onChange={(e) => { setTgPassword(e.target.value); setTgError(""); }}
                          placeholder="Cloud password"
                          onKeyDown={(e) => e.key === "Enter" && handleVerify2fa()}
                          autoFocus
                        />
                        <button onClick={handleVerify2fa} disabled={tgBusy || !tgPassword.trim()}>
                          {tgBusy ? "Checking…" : "Confirm"}
                        </button>
                      </div>
                    </>
                  )}

                  {tgError && (
                    <p style={{ marginTop: 8, fontSize: 12, color: "#ef4444" }}>{tgError}</p>
                  )}
                </div>
              )}

              <button className="ob-cta" onClick={next} style={{ marginTop: 16 }}>
                {hasTelegram || tgPhase === "done" ? "Continue" : "Skip for now"}
              </button>
            </>
          )}

          {/* ── STEP: done ────────────────────────────────────── */}
          {stepKey === "done" && (
            <div className="ob-success">
              <div className="ob-success-ring">✨</div>
              <h2>NORA Intelligence is active</h2>
              <p>
                I'll monitor your connected sources and surface suggestions
                whenever I find something worth your attention. You'll always
                review before anything is added.
              </p>

              {(hasGmail || hasTelegram) && (
                <div className="ob-connected-list">
                  {hasGmail    && <div className="ob-connected-item">📧 Gmail connected</div>}
                  {hasTelegram && <div className="ob-connected-item">✈️ Telegram connected</div>}
                </div>
              )}

              <button className="ob-cta" onClick={finish}>Open NORA</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
