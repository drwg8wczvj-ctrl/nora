import React, { useMemo, useState } from "react";
import { Check, Edit3, Lightbulb, NotebookPen, Plus, Star } from "lucide-react";

const noteText = (note) => note.content || note.items?.map((item) => item.text).filter(Boolean).join(" · ") || "";

export default function JournalWorkspace({ ctx }) {
  const [draft, setDraft] = useState("");
  const recent = useMemo(() => [...(ctx.notes ?? [])]
    .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))
    .slice(0, 5), [ctx.notes]);
  const wins = (ctx.tasks ?? []).filter((task) => task.completed).slice(-4).reverse();
  const priorities = (ctx.todayTasks ?? []).filter((task) => !task.completed).slice(0, 4);
  const saveReflection = () => {
    const value = draft.trim();
    if (!value) return;
    ctx.addNote?.(value);
    setDraft("");
  };

  return (
    <section className="desk-workspace desk-journal-workspace" aria-labelledby="desk-journal-title">
      <header className="desk-workspace-intro">
        <span className="desk-eyebrow"><NotebookPen size={13} /> Journal</span>
        <h1 id="desk-journal-title">Keep the useful thoughts.</h1>
      </header>
      <div className="desk-journal-grid">
        <section className="desk-journal-compose">
          <label htmlFor="desk-reflection">Open thought</label>
          <textarea
            id="desk-reflection"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What is worth remembering from right now?"
          />
          <button onClick={saveReflection} disabled={!draft.trim()}><Plus size={15} /> Save reflection</button>
        </section>
        <section className="desk-journal-panel">
          <h2><Star size={15} /> Recent wins</h2>
          {wins.length ? wins.map((task) => <p key={task.id}><Check size={13} /> {task.title}</p>) : <small>Completed work will appear here.</small>}
        </section>
        <section className="desk-journal-panel">
          <h2><Lightbulb size={15} /> Current priorities</h2>
          {priorities.length ? priorities.map((task) => <p key={task.id}>{task.title}</p>) : <small>No active priorities today.</small>}
        </section>
        <section className="desk-journal-panel desk-journal-recent">
          <h2><Edit3 size={15} /> Continue writing</h2>
          {recent.length ? recent.map((note) => (
            <button key={note.id} onClick={() => setDraft(noteText(note))}>
              <strong>{note.title || "Untitled thought"}</strong>
              <span>{noteText(note).slice(0, 110) || "Empty note"}</span>
            </button>
          )) : <small>Your recent notes will appear here.</small>}
        </section>
      </div>
    </section>
  );
}
