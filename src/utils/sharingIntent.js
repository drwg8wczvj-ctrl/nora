export function extractJoinInviteCode(text) {
  if (!/\b(join|connect|accept|link|invite)\b/i.test(text ?? "")) return null;
  return (text ?? "").toUpperCase().match(/\b[A-HJ-NP-Z2-9]{7}\b/)?.[0] ?? null;
}
