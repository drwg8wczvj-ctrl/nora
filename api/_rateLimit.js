const { getAdminClient } = require("./_auth");

const DEFAULTS = {
  chat: { limit: 60, windowSeconds: 3600 },
  tips: { limit: 90, windowSeconds: 3600 },
  intelligence: { limit: 30, windowSeconds: 3600 },
  integration_sync: { limit: 12, windowSeconds: 3600 },
  integration_auth: { limit: 10, windowSeconds: 900 },
  checkout: { limit: 10, windowSeconds: 3600 },
};

async function enforceRateLimit(req, res, userId, bucket, override = {}) {
  const config = { ...(DEFAULTS[bucket] || DEFAULTS.chat), ...override };
  try {
    const { data, error } = await getAdminClient().rpc("consume_api_rate_limit", {
      p_user_id: userId,
      p_bucket: bucket,
      p_limit: config.limit,
      p_window_seconds: config.windowSeconds,
    });
    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    if (result?.reset_at) {
      const resetSeconds = Math.max(1, Math.ceil((new Date(result.reset_at).getTime() - Date.now()) / 1000));
      res.setHeader("X-RateLimit-Limit", String(config.limit));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, result.remaining ?? 0)));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(new Date(result.reset_at).getTime() / 1000)));
      if (!result.allowed) {
        res.setHeader("Retry-After", String(resetSeconds));
        res.status(429).json({ error: "Too many requests. Please try again later." });
        return false;
      }
    }
    return true;
  } catch (error) {
    // Fail closed for paid or privileged operations. A missing migration must
    // be visible during deployment rather than silently disabling protection.
    console.error(`[rate-limit:${bucket}]`, error);
    res.status(503).json({ error: "Request protection is temporarily unavailable." });
    return false;
  }
}

module.exports = { enforceRateLimit };
