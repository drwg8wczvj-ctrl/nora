// ─── Location Parser ──────────────────────────────────────────────────────
// Matches natural language mentions to saved places.
// Designed to be extended with NLP / AI extraction later.

const COMMON_ALIASES = {
  home:       ['home', 'my place', 'my house', 'my apartment', 'flat'],
  work:       ['work', 'office', 'job', 'workplace', 'the office'],
  gym:        ['gym', 'fitness', 'workout', 'training'],
  university: ['university', 'uni', 'college', 'campus', 'school', 'class'],
  cafe:       ['cafe', 'café', 'coffee shop', 'coffee place'],
};

// Returns the best-matching saved place for a text snippet, or null
export function findPlaceInText(text, savedPlaces = []) {
  if (!text || !savedPlaces.length) return null;
  const lower = text.toLowerCase();

  // Direct name match (case-insensitive, partial)
  for (const place of savedPlaces) {
    if (lower.includes(place.name.toLowerCase())) return place;
  }

  // Alias / tag match
  for (const [tag, variants] of Object.entries(COMMON_ALIASES)) {
    if (variants.some((v) => lower.includes(v))) {
      const match = savedPlaces.find((p) =>
        p.name.toLowerCase().includes(tag) ||
        (Array.isArray(p.tags) && p.tags.includes(tag))
      );
      if (match) return match;
    }
  }

  return null;
}

// Return all saved places mentioned in a block of text
export function extractLocations(text, savedPlaces = []) {
  const lower = text.toLowerCase();
  return savedPlaces.filter((p) => lower.includes(p.name.toLowerCase()));
}
