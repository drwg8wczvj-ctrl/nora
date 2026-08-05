function publicError(res, status, message) {
  return res.status(status).json({ error: message });
}

function internalError(res, error, context = "api") {
  const requestId = crypto.randomUUID();
  console.error(`[${context}] request=${requestId}`, error);
  return res.status(500).json({
    error: "The request could not be completed.",
    requestId,
  });
}

module.exports = { internalError, publicError };
const crypto = require("crypto");
