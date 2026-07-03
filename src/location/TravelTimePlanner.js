// ─── Travel Time Planner ───────────────────────────────────────────────────
// Computes travel blocks between consecutive located tasks in a day.
// This layer is intentionally decoupled from the calendar/task system.

import { estimateTravelMinutes } from './RouteEstimationService';

// Resolve a task's location object to coords, looking up saved places when needed
function resolveCoords(location, savedPlaces) {
  if (!location) return null;
  if (location.placeId) {
    const p = savedPlaces.find((sp) => sp.id === location.placeId);
    if (p?.lat && p?.lng) return { lat: p.lat, lng: p.lng, name: p.name };
  }
  if (location.lat && location.lng) return { lat: location.lat, lng: location.lng, name: location.name };
  return null;
}

function taskEndMin(t) {
  return t.startHour * 60 + (t.startMinute ?? 0) + (t.duration ?? 60);
}

// Returns an array of travel block descriptors for a day's tasks.
// Each block sits between two tasks that have resolvable location coordinates.
export function computeTravelBlocks(tasks = [], savedPlaces = [], transportProfile = {}) {
  const defaultMode = transportProfile.defaultMode ?? 'mixed';

  const timed = tasks
    .filter((t) => t.startHour != null && t.location)
    .map((t) => ({
      task:     t,
      startMin: t.startHour * 60 + (t.startMinute ?? 0),
      endMin:   taskEndMin(t),
      coords:   resolveCoords(t.location, savedPlaces),
    }))
    .filter((e) => e.coords !== null)
    .sort((a, b) => a.startMin - b.startMin);

  const blocks = [];

  for (let i = 0; i < timed.length - 1; i++) {
    const from = timed[i];
    const to   = timed[i + 1];

    // Skip if the two tasks share the same place
    const samePlace =
      from.task.location?.placeId &&
      from.task.location.placeId === to.task.location?.placeId;
    if (samePlace) continue;

    // Check for a per-route transport override
    const overrideKey = `${from.task.location?.placeId ?? 'custom'}->${to.task.location?.placeId ?? 'custom'}`;
    const mode = transportProfile.routeOverrides?.[overrideKey] ?? defaultMode;

    const travelMin = estimateTravelMinutes(from.coords, to.coords, mode);
    if (!travelMin) continue;

    const travelStartMin = from.endMin;
    const travelEndMin   = travelStartMin + travelMin;
    const gap            = to.startMin - travelStartMin;
    const isConflict     = travelEndMin > to.startMin;
    const minutesShort   = isConflict ? travelEndMin - to.startMin : 0;

    blocks.push({
      id:          `travel-${from.task.id}-${to.task.id}`,
      fromTask:    from.task,
      toTask:      to.task,
      fromName:    from.coords.name,
      toName:      to.coords.name,
      mode,
      startMin:    travelStartMin,
      durationMin: travelMin,
      endMin:      travelEndMin,
      gap,
      isConflict,
      minutesShort,
    });
  }

  return blocks;
}

// Validate a proposed task against existing tasks — returns a conflict description or null
export function checkTravelFeasibility(proposedTask, existingTasks, savedPlaces, transportProfile) {
  if (!proposedTask.startHour || !proposedTask.location) return null;

  const allTasks = [...existingTasks, proposedTask];
  const blocks = computeTravelBlocks(allTasks, savedPlaces, transportProfile);

  const conflict = blocks.find((b) => b.isConflict && (
    b.fromTask.id === proposedTask.id || b.toTask.id === proposedTask.id
  ));

  if (!conflict) return null;

  return {
    message: `This may not be realistic: travel from "${conflict.fromName}" to "${conflict.toName}" takes ~${conflict.durationMin} min, but only ${Math.max(0, conflict.gap)} min available.`,
    minutesShort: conflict.minutesShort,
    block: conflict,
  };
}

// Human-readable label for a travel block
export function describeTravelBlock(block) {
  const dur = block.durationMin;
  if (block.isConflict) {
    return `~${dur} min travel — ${block.minutesShort} min short`;
  }
  return `~${dur} min to ${block.toName}`;
}
