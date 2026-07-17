import { Capacitor } from "@capacitor/core";

// Native builds (iOS/Android) bundle the web app locally with no `server.url`
// configured — there's no backend at `capacitor://localhost`, so a relative
// fetch("/api/...") can't reach the Vercel serverless functions at all (it
// resolves against the local scheme handler, which has nothing to serve for
// those paths). Point native builds at the deployed backend instead; web/PWA
// builds keep using same-origin relative paths, which already work today
// (including on preview deployments, since no origin is hardcoded there).
const NATIVE_API_ORIGIN = "https://nora-ten-brown.vercel.app";

export function apiUrl(path) {
  return Capacitor.isNativePlatform() ? `${NATIVE_API_ORIGIN}${path}` : path;
}
