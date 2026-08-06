import React, { useState } from "react";
import { Check, Copy, Pencil, RotateCcw } from "lucide-react";
import { MessagePartsList } from "./MessagePart";
import { partsToPreviewText } from "./messageParts";
import { findTaskReferences } from "../lib/taskReferences";
import "./ConversationMessage.css";

export default function ConversationMessage({
  message,
  className = "",
  bubbleClassName = "",
  assistantName = "Nora",
  onEdit,
  onRetry,
  onOpenAtlas,
  onOpenNora,
  onPlannerAction,
  plannerTasks = [],
}) {
  const [copied, setCopied] = useState(false);
  const role = message?.role ?? "assistant";
  const taskReferences = findTaskReferences(partsToPreviewText(message?.parts ?? []), plannerTasks);
  const copy = async () => {
    const text = partsToPreviewText(message?.parts ?? []);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* Clipboard may be unavailable in embedded/native contexts. */ }
  };

  return (
    <article className={`conversation-message ${role} ${className}`.trim()} aria-label={`${role === "user" ? "You" : assistantName} message`}>
      {role === "assistant" && <div className="conversation-author">{assistantName}</div>}
      <div className={`conversation-message-content ${bubbleClassName}`.trim()}>
        {taskReferences.length > 0 && (
          <div className="conversation-task-references" aria-label="Referenced tasks">
            {taskReferences.map((task) => (
              <span key={task.id} className="conversation-task-reference">
                <span aria-hidden="true" />
                {task.title}
              </span>
            ))}
          </div>
        )}
        <MessagePartsList
          parts={message?.parts}
          onOpenAtlas={onOpenAtlas}
          onOpenNora={onOpenNora}
          onPlannerAction={onPlannerAction}
          plannerTasks={plannerTasks}
        />
      </div>
      <div className="conversation-message-actions">
        <button type="button" onClick={copy} aria-label={copied ? "Copied" : "Copy message"} title={copied ? "Copied" : "Copy"}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        {role === "user" && onEdit && (
          <button type="button" onClick={() => onEdit(message)} aria-label="Edit message" title="Edit">
            <Pencil size={13} />
          </button>
        )}
        {role === "assistant" && onRetry && (
          <button type="button" onClick={() => onRetry(message)} aria-label="Try response again" title="Try again">
            <RotateCcw size={13} />
          </button>
        )}
      </div>
    </article>
  );
}
