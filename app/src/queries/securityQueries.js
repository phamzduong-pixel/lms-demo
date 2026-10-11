const EVENT_TYPES = [
  "access_denied",
  "admin_action",
  "csrf_rejected",
  "database_unavailable",
  "login_failed",
  "login_rate_limited",
  "password_reset_email_error",
  "password_reset_rate_limited",
  "quiz_rate_limited",
  "register_rate_limited",
  "request_rejected",
  "security_audit_store_failed",
  "security_cleanup_failed",
  "suspicious_activity"
];

const IMPORTANT_EVENT_TYPES = [
  "access_denied",
  "admin_action",
  "csrf_rejected",
  "database_unavailable",
  "login_rate_limited",
  "password_reset_email_error",
  "password_reset_rate_limited",
  "quiz_rate_limited",
  "register_rate_limited",
  "request_rejected",
  "security_audit_store_failed",
  "security_cleanup_failed",
  "suspicious_activity"
];

const SEVERITIES = ["info", "warning", "critical"];

function buildFilters(filters = {}) {
  const where = [];
  const values = [];
  if (filters.from) {
    where.push("last_seen_at >= ?");
    values.push(filters.from + " 00:00:00");
  }
  if (filters.to) {
    where.push("last_seen_at < DATE_ADD(?, INTERVAL 1 DAY)");
    values.push(filters.to + " 00:00:00");
  }
  if (filters.importantOnly) {
    where.push("event_type IN (" + IMPORTANT_EVENT_TYPES.map(() => "?").join(", ") + ")");
    values.push(...IMPORTANT_EVENT_TYPES);
  }
  if (EVENT_TYPES.includes(filters.eventType)) {
    where.push("event_type = ?");
    values.push(filters.eventType);
  }
  if (SEVERITIES.includes(filters.severity)) {
    where.push("severity = ?");
    values.push(filters.severity);
  }
  return { clause: where.length ? " WHERE " + where.join(" AND ") : "", values };
}

async function countEvents(pool, filters) {
  const query = buildFilters(filters);
  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS total FROM security_events" + query.clause,
    query.values
  );
  return Number(rows[0]?.total || 0);
}

async function listEvents(pool, filters, pageSize = 20, offset = 0) {
  const query = buildFilters(filters);
  const [rows] = await pool.execute(
    "SELECT id, created_at, event_type, severity, request_id, actor_user_id, " +
      "ip_hash, account_hash, route, method, status_code, details_json, " +
      "occurrence_count, first_seen_at, last_seen_at " +
      "FROM security_events" + query.clause +
      " ORDER BY last_seen_at DESC, id DESC LIMIT ? OFFSET ?",
    [...query.values, pageSize, offset]
  );
  return rows;
}

async function purgeEventsBatch(pool, retentionDays = 90, batchSize = 500) {
  const days = Math.max(1, Math.floor(Number(retentionDays) || 90));
  const limit = Math.max(1, Math.min(5000, Math.floor(Number(batchSize) || 500)));
  const [result] = await pool.execute(
    "DELETE FROM security_events " +
      "WHERE last_seen_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL " + days + " DAY) " +
      "ORDER BY last_seen_at ASC LIMIT ?",
    [limit]
  );
  return Number(result?.affectedRows || 0);
}

// Giữ tên cũ cho code gọi ngoài, nhưng chính sách mới chỉ xóa một batch mỗi lần.
async function purgeEvents(pool, retentionDays = 90, batchSize = 500) {
  return purgeEventsBatch(pool, retentionDays, batchSize);
}

module.exports = {
  EVENT_TYPES,
  IMPORTANT_EVENT_TYPES,
  SEVERITIES,
  buildFilters,
  countEvents,
  listEvents,
  purgeEventsBatch,
  purgeEvents
};
