const crypto = require("node:crypto");

const SENSITIVE_KEY = /password|passcode|token|cookie|session|secret|smtp|authorization|csrf|database|connection|email|(^|_)ip($|_)/i;
const GROUP_WINDOW_DEFAULT_MINUTES = 15;

function getHashSecret(env = process.env) {
  return env.SECURITY_HASH_SECRET || env.SESSION_SECRET || "local-development-only";
}

function hashIdentifier(value, env = process.env) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return crypto.createHmac("sha256", getHashSecret(env)).update(normalized).digest("hex");
}

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function sanitizeValue(value, depth = 0) {
  if (depth > 2 || value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.slice(0, 240)
      .replace(/\b[A-Z0-9._%+-]+\@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email-da-an]")
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip-da-an]");
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_KEY.test(key))
        .slice(0, 20)
        .map(([key, item]) => [key.slice(0, 80), sanitizeValue(item, depth + 1)])
    );
  }
  return String(value).slice(0, 240);
}

function requestContext(req) {
  return {
    requestId: req.requestId || null,
    ipHash: hashIdentifier(clientIp(req)),
    actorUserId: req.user ? Number(req.user.id) : null,
    route: typeof req.path === "string" ? req.path.slice(0, 255) : null,
    method: typeof req.method === "string" ? req.method.slice(0, 10) : null
  };
}

function groupWindowMinutes(env = process.env) {
  const value = Number(env.SECURITY_EVENT_GROUP_WINDOW_MINUTES);
  return Number.isFinite(value) && value >= 1 && value <= 1440
    ? value
    : GROUP_WINDOW_DEFAULT_MINUTES;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
  );
}

function groupingDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  return Object.fromEntries(
    Object.entries(details)
      .filter(([key]) => !/retry_after|occurrence|timestamp|request_id/i.test(key))
      .map(([key, value]) => [key, value])
  );
}

function buildGroupKey(event, details, now = Date.now(), env = process.env) {
  const windowMs = groupWindowMinutes(env) * 60 * 1000;
  const bucket = Math.floor(now / windowMs);
  const identity = stableValue({
    event_type: event.eventType,
    severity: event.severity,
    actor_user_id: event.actorUserId ?? null,
    ip_hash: event.ipHash || null,
    account_hash: event.accountHash || null,
    route: event.route || null,
    method: event.method || null,
    details: groupingDetails(details),
    bucket
  });
  return crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

function logStructuredEvent(event) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    type: event.eventType,
    severity: event.severity,
    request_id: event.requestId || null,
    actor_user_id: event.actorUserId ?? null,
    ip_hash: event.ipHash || null,
    route: event.route || null,
    method: event.method || null,
    status_code: event.statusCode || null,
    details: event.details || {}
  });
  if (event.severity === "critical") console.error(line);
  else if (event.severity === "warning") console.warn(line);
  else console.log(line);
}

async function recordEvent(pool, event = {}) {
  const now = event.createdAt instanceof Date ? event.createdAt : new Date();
  const safeEvent = {
    eventType: String(event.eventType || "security_event").slice(0, 64),
    severity: ["info", "warning", "critical"].includes(event.severity) ? event.severity : "info",
    requestId: event.requestId || null,
    actorUserId: event.actorUserId === null || event.actorUserId === undefined
      ? null
      : Number.isSafeInteger(Number(event.actorUserId)) ? Number(event.actorUserId) : null,
    ipHash: event.ipHash || null,
    accountHash: event.accountHash || null,
    route: event.route || null,
    method: event.method || null,
    statusCode: Number.isInteger(event.statusCode) ? event.statusCode : null,
    details: sanitizeValue(event.details || {})
  };

  if (!pool || typeof pool.execute !== "function") {
    logStructuredEvent(safeEvent);
    return;
  }

  const groupKey = buildGroupKey(safeEvent, safeEvent.details, now.getTime());
  try {
    const [result] = await pool.execute(
      "INSERT INTO security_events " +
        "(created_at, event_type, severity, request_id, actor_user_id, ip_hash, account_hash, route, method, status_code, details_json, group_key, occurrence_count, first_seen_at, last_seen_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?) " +
        "ON DUPLICATE KEY UPDATE " +
        "occurrence_count = occurrence_count + 1, last_seen_at = VALUES(last_seen_at), " +
        "request_id = VALUES(request_id), actor_user_id = VALUES(actor_user_id), " +
        "ip_hash = VALUES(ip_hash), account_hash = VALUES(account_hash), route = VALUES(route), " +
        "method = VALUES(method), status_code = VALUES(status_code), details_json = VALUES(details_json)",
      [
        now,
        safeEvent.eventType,
        safeEvent.severity,
        safeEvent.requestId,
        safeEvent.actorUserId,
        safeEvent.ipHash,
        safeEvent.accountHash,
        safeEvent.route,
        safeEvent.method,
        safeEvent.statusCode,
        JSON.stringify(safeEvent.details),
        groupKey,
        now,
        now
      ]
    );

    // Chỉ ghi structured log khi nhóm được tạo; counter trong DB giữ các lần sau.
    if (!result || result.affectedRows === 1) logStructuredEvent(safeEvent);
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      type: "security_audit_store_failed",
      severity: "critical",
      request_id: safeEvent.requestId,
      reason: error.code || "database_error"
    }));
  }
}

function recordRequestEvent(req, pool, event = {}) {
  if (!pool) return Promise.resolve();
  return recordEvent(pool, { ...requestContext(req), ...event });
}

module.exports = {
  clientIp,
  hashIdentifier,
  requestContext,
  recordEvent,
  recordRequestEvent,
  sanitizeValue,
  groupWindowMinutes,
  buildGroupKey,
  groupingDetails
};
