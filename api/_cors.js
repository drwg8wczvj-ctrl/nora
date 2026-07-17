// Shared CORS handling for API routes the native iOS/Android app calls.
// The Capacitor app loads its bundled web content from a different origin
// (capacitor://localhost) than this deployment, so every route it fetches
// needs these headers plus an explicit OPTIONS preflight response — without
// them the browser blocks the response even though the request succeeds.
function applyCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { applyCors };
