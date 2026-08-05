import React, { useState } from "react";
import { Check, KeyRound } from "lucide-react";
import CloseButton from "./CloseButton";
import "./JoinCodeModal.css";

export default function JoinCodeModal({ onClose, onJoin }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [joinedTitle, setJoinedTitle] = useState("");

  async function submit(event) {
    event?.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode || loading) return;
    setLoading(true);
    setError("");
    try {
      const object = await onJoin(cleanCode);
      setJoinedTitle(object?.data?.title ?? object?.data?.name ?? "Shared item");
    } catch (joinError) {
      setError(joinError?.message ?? "Could not join with this code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="jcm-overlay" onClick={onClose}>
      <div className="jcm-modal" onClick={event => event.stopPropagation()}>
        <div className="jcm-header">
          <div className="jcm-title"><KeyRound size={16} /> Join shared task</div>
          <CloseButton onClick={onClose} size={26} />
        </div>
        {joinedTitle ? (
          <div className="jcm-body jcm-success" role="status">
            <Check size={24} />
            <strong>{joinedTitle}</strong>
            <span>was added to your planner.</span>
          </div>
        ) : (
          <form className="jcm-body" onSubmit={submit}>
            <label className="jcm-label" htmlFor="join-code">Invite code</label>
            <input id="join-code" className="jcm-input" value={code} autoFocus
              onChange={event => setCode(event.target.value.toUpperCase())}
              placeholder="Enter code" autoCapitalize="characters" autoComplete="off" />
            <p className="jcm-hint">Enter the code sent by the task owner.</p>
            {error && <p className="jcm-error" role="alert">{error}</p>}
            <button className="jcm-submit" type="submit" disabled={!code.trim() || loading}>
              {loading ? "Joining…" : "Join task"}
            </button>
          </form>
        )}
        {joinedTitle && <div className="jcm-footer"><button className="jcm-submit" onClick={onClose}>Done</button></div>}
      </div>
    </div>
  );
}
