import React from "react";
import { hapticSelection } from "../lib/haptics";
import { NativeSegmentedControl } from "../components/ui/NativeUI";

// Segmented control switching the Status page between Work (Nora/Planner —
// task execution) and Mind (Atlas — stress/recovery/emotional patterns).
export default function WorkMindToggle({ active, onChange }) {
  const select = (value) => {
    if (value === active) return;
    hapticSelection();
    onChange(value);
  };
  return (
    <NativeSegmentedControl
      className="status-worktab-toggle"
      label="Status view"
      value={active}
      onChange={select}
      options={[
        { value: "work", label: "Work" },
        { value: "mind", label: "Mind" },
      ]}
    />
  );
}
