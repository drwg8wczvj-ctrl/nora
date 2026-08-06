const { getReadiness } = require("./_env");

module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ status: "error", error: "Method not allowed" });
  }

  const readiness = getReadiness();
  const body = {
    status: readiness.ready ? "ok" : "degraded",
    ready: readiness.ready,
    missingConfiguration: readiness.missing,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || "development",
    timestamp: new Date().toISOString(),
  };

  if (req.method === "HEAD") return res.status(readiness.ready ? 200 : 503).end();
  return res.status(readiness.ready ? 200 : 503).json(body);
}
