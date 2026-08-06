import React, { useState } from "react";
import { Check, KeyRound } from "lucide-react";
import {
  NativeAlert,
  NativeButton,
  NativeDialog,
  NativeField,
} from "./ui/NativeUI";
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
    <NativeDialog
      onClose={onClose}
      title="Join shared task"
      subtitle="Use an invite code to add a shared item to your planner."
      className="jcm-dialog"
      footer={joinedTitle ? (
        <NativeButton onClick={onClose}>Done</NativeButton>
      ) : (
        <>
          <NativeButton variant="tertiary" onClick={onClose}>Cancel</NativeButton>
          <NativeButton
            type="submit"
            form="join-code-form"
            loading={loading}
            disabled={!code.trim()}
            leading={<KeyRound size={16} />}
          >
            Join task
          </NativeButton>
        </>
      )}
    >
      {joinedTitle ? (
        <div className="jcm-success" role="status">
          <span className="jcm-success__icon"><Check size={24} /></span>
          <strong>{joinedTitle}</strong>
          <span>was added to your planner.</span>
        </div>
      ) : (
        <form id="join-code-form" className="jcm-form" onSubmit={submit}>
          <NativeField
            id="join-code"
            label="Invite code"
            hint="Codes are not case-sensitive."
            value={code}
            autoFocus
            onChange={event => setCode(event.target.value.toUpperCase())}
            placeholder="ENTER CODE"
            autoCapitalize="characters"
            autoComplete="off"
            leading={<KeyRound size={16} />}
            className="jcm-code-field"
          />
          {error && (
            <NativeAlert tone="danger" title="Couldn’t join this task">
              {error}
            </NativeAlert>
          )}
        </form>
      )}
    </NativeDialog>
  );
}
