const { hashIdentifier } = require("./securityService");

const DEFAULT_RULES = {
  login_account: { max: 5, windowMinutes: 5, blockMinutes: 5 },
  login_ip: { max: 20, windowMinutes: 10, blockMinutes: 10 },
  register_ip: { max: 10, windowMinutes: 15, blockMinutes: 15 },
  register_email: { max: 3, windowMinutes: 60, blockMinutes: 60 },
  forgot_ip: { max: 10, windowMinutes: 15, blockMinutes: 15 },
  forgot_email: { max: 3, windowMinutes: 15, blockMinutes: 15 },
  reset_ip: { max: 10, windowMinutes: 10, blockMinutes: 10 },
  quiz_user: { max: 10, windowMinutes: 10, blockMinutes: 5 },
  quiz_ip: { max: 30, windowMinutes: 10, blockMinutes: 5 }
};

function positiveNumber(value, fallback, minimum = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum ? number : fallback;
}

function getRule(type, env = process.env) {
  const defaults = DEFAULT_RULES[type];
  if (!defaults) throw new Error("Unknown rate limit rule: " + type);
  const prefix = "RATE_LIMIT_" + type.toUpperCase();
  return {
    type,
    max: positiveNumber(env[prefix + "_MAX"], defaults.max),
    windowMs: positiveNumber(env[prefix + "_WINDOW_MINUTES"], defaults.windowMinutes) * 60 * 1000,
    blockMs: positiveNumber(env[prefix + "_BLOCK_MINUTES"], defaults.blockMinutes) * 60 * 1000
  };
}

function scope(type, value) {
  return {
    scopeType: type,
    scopeKey: hashIdentifier(type + ":" + String(value ?? "").trim().toLowerCase())
  };
}

function timestamp(value) {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function retryAfterSeconds(until, now = Date.now()) {
  return Math.max(1, Math.ceil((timestamp(until) - now) / 1000));
}

function resultFromRow(row, rule, now = new Date()) {
  const blockedUntil = row && row.blocked_until ? new Date(row.blocked_until) : null;
  const blocked = Boolean(blockedUntil && blockedUntil.getTime() > now.getTime());
  return {
    type: rule.type,
    max: rule.max,
    count: row ? Number(row.hit_count || 0) : 0,
    blocked,
    blockedRequest: false,
    blockStarted: false,
    retryAfter: blocked ? retryAfterSeconds(blockedUntil, now.getTime()) : 0
  };
}

async function check(pool, type, value, options = {}) {
  const rule = options.rule || getRule(type, options.env);
  const key = scope(type, value);
  const [rows] = await pool.execute(
    "SELECT hit_count, blocked_until FROM security_rate_limits WHERE scope_type = ? AND scope_key = ?",
    [key.scopeType, key.scopeKey]
  );
  return resultFromRow(rows[0], rule, options.now || new Date());
}

async function consume(pool, type, value, options = {}) {
  const rule = options.rule || getRule(type, options.env);
  const key = scope(type, value);
  const now = options.now || new Date();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      "SELECT window_started_at, hit_count, blocked_until " +
        "FROM security_rate_limits WHERE scope_type = ? AND scope_key = ? FOR UPDATE",
      [key.scopeType, key.scopeKey]
    );
    const current = rows[0];
    const currentBlockedUntil = current && current.blocked_until ? new Date(current.blocked_until) : null;
    if (currentBlockedUntil && currentBlockedUntil.getTime() > now.getTime()) {
      await connection.commit();
      return {
        ...resultFromRow(current, rule, now),
        blockedRequest: true
      };
    }

    const currentWindow = current ? timestamp(current.window_started_at) : 0;
    const inWindow = currentWindow > 0 && now.getTime() - currentWindow < rule.windowMs;
    const hitCount = inWindow ? Number(current.hit_count || 0) + 1 : 1;
    const blockedUntil = hitCount >= rule.max ? new Date(now.getTime() + rule.blockMs) : null;

    if (current) {
      await connection.execute(
        "UPDATE security_rate_limits SET window_started_at = ?, hit_count = ?, blocked_until = ?, last_seen_at = ? " +
          "WHERE scope_type = ? AND scope_key = ?",
        [inWindow ? new Date(currentWindow) : now, hitCount, blockedUntil, now, key.scopeType, key.scopeKey]
      );
    } else {
      await connection.execute(
        "INSERT INTO security_rate_limits " +
          "(scope_type, scope_key, window_started_at, hit_count, blocked_until, last_seen_at) " +
          "VALUES (?, ?, ?, ?, ?, ?)",
        [key.scopeType, key.scopeKey, now, hitCount, blockedUntil, now]
      );
    }
    await connection.commit();
    return {
      type: rule.type,
      max: rule.max,
      count: hitCount,
      blocked: Boolean(blockedUntil),
      blockedRequest: false,
      blockStarted: Boolean(blockedUntil),
      retryAfter: blockedUntil ? retryAfterSeconds(blockedUntil, now.getTime()) : 0
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function clear(pool, type, value) {
  const key = scope(type, value);
  await pool.execute(
    "DELETE FROM security_rate_limits WHERE scope_type = ? AND scope_key = ?",
    [key.scopeType, key.scopeKey]
  );
}

async function checkMany(pool, entries, options = {}) {
  return Promise.all(entries.map((entry) => check(pool, entry.type, entry.value, options)));
}

async function consumeMany(pool, entries, options = {}) {
  const results = [];
  for (const entry of entries) {
    results.push(await consume(pool, entry.type, entry.value, options));
  }
  return results;
}

function blockedResult(results) {
  const blocked = results.filter((result) => result.blocked);
  return {
    blocked: blocked.length > 0,
    blockStarted: results.some((result) => result.blockStarted),
    blockedRequest: results.some((result) => result.blockedRequest),
    retryAfter: blocked.reduce((longest, result) => Math.max(longest, result.retryAfter), 0),
    results
  };
}

async function purgeBatch(pool, retentionHours = 72, batchSize = 500) {
  const hours = Math.max(1, Math.floor(Number(retentionHours) || 72));
  const limit = Math.max(1, Math.min(5000, Math.floor(Number(batchSize) || 500)));
  const [result] = await pool.execute(
    "DELETE FROM security_rate_limits " +
      "WHERE last_seen_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL " + hours + " HOUR) " +
      "ORDER BY last_seen_at ASC LIMIT ?",
    [limit]
  );
  return Number(result?.affectedRows || 0);
}

async function purge(pool, retentionHours = 72, batchSize = 500) {
  return purgeBatch(pool, retentionHours, batchSize);
}

module.exports = {
  DEFAULT_RULES,
  getRule,
  scope,
  check,
  consume,
  clear,
  checkMany,
  consumeMany,
  blockedResult,
  purgeBatch,
  purge,
  retryAfterSeconds
};
