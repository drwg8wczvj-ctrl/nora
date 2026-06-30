import React, { useState } from "react";
import { X, CheckCircle, Sparkles } from "lucide-react";

const STEPS = ["welcome", "gmail", "telegram", "done"];
const TOTAL  = STEPS.length - 1; // exclude done from progress dots

const TELEGRAM_BOT   = "https://t.me/NoraAssistantTelegramm_bot";

export default function IntelligenceOnboarding({
  onClose,
  onConnectGmail,
  onLinkTelegram,
  hasGmail,
  hasTelegram,
  markOnboarded,
}) {
  const [step, setStep]           = useState(0);
  const [linkCode, setLinkCode]   = useState("");
  const [linking, setLinking]     = useState(false);
  const [linkError, setLinkError] = useState("");
  const [linkDone, setLinkDone]   = useState(false);

  const stepKey = STEPS[step];

  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else finish();
  };
  const finish = () => {
    markOnboarded?.();
    onClose();
  };

  const handleLinkTelegram = async () => {
    if (!linkCode.trim()) return;
    setLinking(true);
    setLinkError("");
    const result = await onLinkTelegram(linkCode.trim());
    setLinking(false);
    if (result?.ok) {
      setLinkDone(true);
      setTimeout(next, 1200);
    } else {
      setLinkError(result?.error ?? "Invalid code. Check you copied it correctly.");
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
                  Forward messages to NORA's Telegram bot and they'll be
                  analyzed automatically — no copy-paste needed.
                </p>
              </div>

              {hasTelegram || linkDone ? (
                <button className="ob-connect-btn connected" disabled>
                  <CheckCircle size={18} />
                  Telegram Connected
                </button>
              ) : (
                <div className="ob-telegram-steps">
                  <h4>How to connect</h4>
                  <div className="ob-telegram-step">
                    <div className="ob-telegram-step-num">1</div>
                    <span>
                      Open{" "}
                      <a href={TELEGRAM_BOT} target="_blank" rel="noopener noreferrer"
                         style={{ color: "var(--accent)" }}>
                        @NoraAssistantBot
                      </a>{" "}
                      on Telegram and send <code style={{ background: "var(--surface-2)", padding: "1px 5px", borderRadius: 4 }}>/start</code>
                    </span>
                  </div>
                  <div className="ob-telegram-step">
                    <div className="ob-telegram-step-num">2</div>
                    <span>The bot will send you a link code like <code style={{ background: "var(--surface-2)", padding: "1px 5px", borderRadius: 4 }}>NORA-xxxxx-XXXXXX</code></span>
                  </div>
                  <div className="ob-telegram-step">
                    <div className="ob-telegram-step-num">3</div>
                    <span>Paste it below to link your account</span>
                  </div>

                  <div className="ob-link-code-input">
                    <input
                      type="text"
                      value={linkCode}
                      onChange={(e) => { setLinkCode(e.target.value); setLinkError(""); }}
                      placeholder="NORA-000000-XXXXXX"
                      onKeyDown={(e) => e.key === "Enter" && handleLinkTelegram()}
                    />
                    <button onClick={handleLinkTelegram} disabled={linking || !linkCode.trim()}>
                      {linking ? "Linking…" : "Link"}
                    </button>
                  </div>
                  {linkError && (
                    <p style={{ marginTop: 8, fontSize: 12, color: "#ef4444" }}>{linkError}</p>
                  )}
                </div>
              )}

              <button className="ob-cta" onClick={next} style={{ marginTop: 12 }}>
                {hasTelegram || linkDone ? "Continue" : "Skip for now"}
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
