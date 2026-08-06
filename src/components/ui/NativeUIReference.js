import React, { useState } from "react";
import { Bell, CalendarDays, Search } from "lucide-react";
import BrandStar from "../BrandStar";
import {
  NativeAlert,
  NativeButton,
  NativeEmptyState,
  NativeField,
  NativeIconButton,
  NativeListRow,
  NativeSection,
  NativeSegmentedControl,
  NativeSelectionMark,
  NativeSheet,
  NativeToolbar,
} from "./NativeUI";
import "./NativeUIReference.css";

/**
 * Compact Phase 1 reference surface. It is intentionally not mounted in the
 * production navigation; migrated screens compose these exact primitives.
 */
export default function NativeUIReference({ persona = "nora" }) {
  const [segment, setSegment] = useState("day");
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <main
      className="native-ui native-ui-reference"
      data-native-ui
      data-persona={persona}
      aria-label="Native UI component reference"
    >
      <header className="native-ui-reference__hero">
        <BrandStar size={34} tone={persona === "atlas" ? "gold" : "purple"} />
        <div>
          <p>{persona === "atlas" ? "ATLAS" : "NORA"}</p>
          <h1>Native interface foundation</h1>
        </div>
      </header>

      <NativeSegmentedControl
        label="Schedule view"
        value={segment}
        onChange={setSegment}
        options={[
          { value: "day", label: "Day" },
          { value: "week", label: "Week" },
          { value: "month", label: "Month" },
        ]}
      />

      <NativeSection title="Today" description="Clear hierarchy, one primary action">
        <NativeListRow
          leading={<CalendarDays size={18} />}
          title="Prepare WU study plan"
          subtitle="Deep work · 10:00–12:00"
          trailing={<NativeSelectionMark selected />}
        />
        <NativeListRow
          leading={<BrandStar size={18} tone="current" />}
          title="Review Nora proposal"
          subtitle="AI plan · waiting for approval"
          meta="14:30"
          onClick={() => {}}
        />
      </NativeSection>

      <NativeField label="Task name" placeholder="What needs to be done?" leading={<Search size={17} />} />

      <NativeAlert tone="accent" title="Nora prepared a better position">
        Review the schedule before anything changes.
      </NativeAlert>

      <NativeEmptyState
        title="Your afternoon is clear"
        description="Nora can use the open time without turning the plan into another wall of text."
        action={<NativeButton onClick={() => setSheetOpen(true)}>Preview plan</NativeButton>}
      />

      <NativeToolbar>
        <NativeIconButton label="Notifications" variant="tertiary"><Bell size={18} /></NativeIconButton>
        <NativeButton variant="secondary">Not now</NativeButton>
        <NativeButton leading={<BrandStar size={16} tone="white" />}>Ask Nora</NativeButton>
      </NativeToolbar>

      <NativeSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Plan preview"
        subtitle="Nothing changes until you approve."
        footer={<NativeButton size="wide" onClick={() => setSheetOpen(false)}>Approve plan</NativeButton>}
      >
        <NativeListRow title="WU preparation" subtitle="Monday · 10:00–12:00" />
        <NativeListRow title="Nora product work" subtitle="Tuesday · 15:30–17:30" />
      </NativeSheet>
    </main>
  );
}
