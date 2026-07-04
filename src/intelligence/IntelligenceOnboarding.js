import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

const STEPS = ["welcome", "gmail", "telegram", "done"];
const TOTAL  = STEPS.length - 1; // exclude done from progress dots


export default function IntelligenceOnboarding({
  onClose,
  onConnectGmail,
  onConnectTelegramPhone,
  onVerifyTelegramCode,
  hasGmail,
  hasTelegram,
  markOnboarded,
}) {
  const { t } = useTranslation();
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
      setTgError(result?.error ?? t("ob.errSendCode"));
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
      setTgError(result?.error ?? t("ob.errWrongCode"));
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
      setTgError(result?.error ?? t("ob.errWrongPassword"));
    }
  };

  return createPortal(
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
                <h1>{t("ob.meetTitle")}</h1>
                <p>{t("ob.meetDesc")}</p>
              </div>

              <div className="ob-features">
                {[
                  { icon: "📅", titleKey: "ob.feat.appointmentTitle", descKey: "ob.feat.appointmentDesc" },
                  { icon: "✈️", titleKey: "ob.feat.travelTitle",      descKey: "ob.feat.travelDesc" },
                  { icon: "🍽️", titleKey: "ob.feat.reservationTitle", descKey: "ob.feat.reservationDesc" },
                  { icon: "⏰", titleKey: "ob.feat.deadlineTitle",    descKey: "ob.feat.deadlineDesc" },
                ].map(({ icon, titleKey, descKey }) => (
                  <div key={titleKey} className="ob-feature">
                    <div className="ob-feature-icon">{icon}</div>
                    <div className="ob-feature-text">
                      <strong>{t(titleKey)}</strong>
                      <span>{t(descKey)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <button className="ob-cta" onClick={next}>{t("ob.getStarted")}</button>
              <button className="ob-skip" onClick={finish}>{t("ob.maybeLater")}</button>
            </>
          )}

          {/* ── STEP: gmail ───────────────────────────────────── */}
          {stepKey === "gmail" && (
            <>
              <div className="ob-connect-hero">
                <div className="ob-connect-icon-wrap gmail">📧</div>
                <h2>{t("ob.connectGmailTitle")}</h2>
                <p>{t("ob.connectGmailDesc")}</p>
              </div>

              {hasGmail ? (
                <button className="ob-connect-btn connected" disabled>
                  <CheckCircle size={18} />
                  {t("ob.gmailConnected")}
                </button>
              ) : (
                <button className="ob-connect-btn gmail" onClick={onConnectGmail}>
                  <span>G</span>
                  {t("ob.connectWithGoogle")}
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
                {t("ob.gmailPrivacy")}
              </div>

              <button className="ob-cta" onClick={next}>
                {hasGmail ? t("ob.continue") : t("ob.skipForNow")}
              </button>
            </>
          )}

          {/* ── STEP: telegram ────────────────────────────────── */}
          {stepKey === "telegram" && (
            <>
              <div className="ob-connect-hero">
                <div className="ob-connect-icon-wrap telegram">✈️</div>
                <h2>{t("ob.connectTelegramTitle")}</h2>
                <p>{t("ob.connectTelegramDesc")}</p>
              </div>

              {hasTelegram || tgPhase === "done" ? (
                <button className="ob-connect-btn connected" disabled>
                  <CheckCircle size={18} />
                  {tgName ? t("ob.telegramConnectedName", { name: tgName }) : t("ob.telegramConnected")}
                </button>
              ) : (
                <div className="ob-telegram-steps">

                  {/* Phone input */}
                  {tgPhase === "phone" && (
                    <>
                      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>
                        {t("ob.enterPhone")}
                      </p>
                      <div className="ob-link-code-input">
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => { setPhone(e.target.value); setTgError(""); }}
                          placeholder={t("ob.phonePlaceholder")}
                          onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                          autoFocus
                        />
                        <button onClick={handleSendCode} disabled={tgBusy || !phone.trim()}>
                          {tgBusy ? t("ob.sending") : t("ob.sendCode")}
                        </button>
                      </div>
                      <p style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
                        {t("ob.phoneHint")}
                      </p>
                    </>
                  )}

                  {/* OTP input */}
                  {tgPhase === "code" && (
                    <>
                      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>
                        {t("ob.codeSentTo", { phone })}
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
                          {tgBusy ? t("ob.verifying") : t("ob.verify")}
                        </button>
                      </div>
                      <button
                        style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", marginTop: 6, padding: 0 }}
                        onClick={() => { setTgPhase("phone"); setCode(""); setTgError(""); }}
                      >
                        {t("ob.useDifferentNumber")}
                      </button>
                    </>
                  )}

                  {/* 2FA password */}
                  {tgPhase === "2fa" && (
                    <>
                      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>
                        {t("ob.twoFaDesc")}
                      </p>
                      <div className="ob-link-code-input">
                        <input
                          type="password"
                          value={tgPassword}
                          onChange={(e) => { setTgPassword(e.target.value); setTgError(""); }}
                          placeholder={t("ob.cloudPassword")}
                          onKeyDown={(e) => e.key === "Enter" && handleVerify2fa()}
                          autoFocus
                        />
                        <button onClick={handleVerify2fa} disabled={tgBusy || !tgPassword.trim()}>
                          {tgBusy ? t("ob.checking") : t("ob.confirm")}
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
                {hasTelegram || tgPhase === "done" ? t("ob.continue") : t("ob.skipForNow")}
              </button>
            </>
          )}

          {/* ── STEP: done ────────────────────────────────────── */}
          {stepKey === "done" && (
            <div className="ob-success">
              <div className="ob-success-ring">✨</div>
              <h2>{t("ob.doneTitle")}</h2>
              <p>{t("ob.doneDesc")}</p>

              {(hasGmail || hasTelegram) && (
                <div className="ob-connected-list">
                  {hasGmail    && <div className="ob-connected-item">{t("ob.gmailConnectedItem")}</div>}
                  {hasTelegram && <div className="ob-connected-item">{t("ob.telegramConnectedItem")}</div>}
                </div>
              )}

              <button className="ob-cta" onClick={finish}>{t("ob.openNora")}</button>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
