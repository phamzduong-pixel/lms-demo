const test = require("node:test");
const assert = require("node:assert/strict");
const rateLimitService = require("../src/services/rateLimitService");
const securityService = require("../src/services/securityService");

test("rate limit rules expose the configured defaults and environment overrides", () => {
  assert.deepEqual(rateLimitService.getRule("login_account", {}), {
    type: "login_account",
    max: 5,
    windowMs: 5 * 60 * 1000,
    blockMs: 5 * 60 * 1000
  });
  assert.deepEqual(rateLimitService.getRule("login_ip", {
    RATE_LIMIT_LOGIN_IP_MAX: "7",
    RATE_LIMIT_LOGIN_IP_WINDOW_MINUTES: "2",
    RATE_LIMIT_LOGIN_IP_BLOCK_MINUTES: "3"
  }), {
    type: "login_ip",
    max: 7,
    windowMs: 2 * 60 * 1000,
    blockMs: 3 * 60 * 1000
  });
});

test("rate limit scopes are stable for normalized identifiers", () => {
  assert.equal(
    rateLimitService.scope("login_account", "  Student@Example.COM ").scopeKey,
    rateLimitService.scope("login_account", "student@example.com").scopeKey
  );
  assert.notEqual(
    rateLimitService.scope("login_account", "student@example.com").scopeKey,
    rateLimitService.scope("login_ip", "student@example.com").scopeKey
  );
});

test("audit details remove sensitive values and bound nested data", () => {
  const safe = securityService.sanitizeValue({
    password: "do-not-log",
    reset_token: "do-not-log",
    outcome: "failed",
    nested: { cookie: "do-not-log", reason: "invalid" }
  });
  assert.deepEqual(safe, {
    outcome: "failed",
    nested: { reason: "invalid" }
  });
});

test("blocked result returns the longest retry period across shared scopes", () => {
  const result = rateLimitService.blockedResult([
    { type: "login_ip", count: 2, max: 20, blocked: false, retryAfter: 0 },
    { type: "login_account", count: 5, max: 5, blocked: true, retryAfter: 300 }
  ]);
  assert.equal(result.blocked, true);
  assert.equal(result.retryAfter, 300);
});



test("security group keys ignore volatile retry data but separate source and admin objects", () => {
  const event = {
    eventType: "admin_action",
    severity: "info",
    actorUserId: 7,
    ipHash: "ip-a",
    accountHash: "account-a",
    route: "/admin/courses/1/toggle-status",
    method: "POST"
  };
  const env = { SECURITY_EVENT_GROUP_WINDOW_MINUTES: "15" };
  const first = securityService.buildGroupKey(event, {
    action: "course_published",
    course_id: 1,
    retry_after_seconds: 10
  }, 1_800_000, env);
  const sameGroup = securityService.buildGroupKey(event, {
    retry_after_seconds: 99,
    course_id: 1,
    action: "course_published"
  }, 1_800_100, env);
  const differentObject = securityService.buildGroupKey(event, {
    action: "course_published",
    course_id: 2
  }, 1_800_100, env);
  const differentSource = securityService.buildGroupKey({ ...event, ipHash: "ip-b" }, {
    action: "course_published",
    course_id: 1
  }, 1_800_100, env);

  assert.equal(first, sameGroup);
  assert.notEqual(first, differentObject);
  assert.notEqual(first, differentSource);
  assert.notEqual(first, securityService.buildGroupKey(event, { action: "course_published", course_id: 1 }, 2_700_000, env));
});

test("recordEvent uses a unique grouped upsert suitable for concurrent requests", async () => {
  const calls = [];
  const pool = {
    execute: async (...args) => {
      calls.push(args);
      return [{ affectedRows: 2 }, []];
    }
  };
  const event = {
    eventType: "csrf_rejected",
    severity: "warning",
    ipHash: "ip-hash",
    route: "/admin/courses",
    method: "POST",
    details: { reason: "invalid_or_missing_token", retry_after_seconds: 5 }
  };

  await Promise.all(Array.from({ length: 8 }, () => securityService.recordEvent(pool, event)));

  assert.equal(calls.length, 8);
  assert.ok(calls.every(([sql]) => sql.includes("ON DUPLICATE KEY UPDATE")));
  assert.equal(new Set(calls.map(([, params]) => params[11])).size, 1);
});

test("sanitizeValue redacts raw email and IP text in event details", () => {
  assert.deepEqual(securityService.sanitizeValue({
    message: "user@example.com from 192.168.1.10",
    email: "user@example.com",
    ip_address: "192.168.1.10"
  }), {
    message: "[email-da-an] from [ip-da-an]"
  });
});


test("rate limit distinguishes block start from repeated blocked requests", async () => {
  const now = new Date("2026-10-12T00:00:00.000Z");
  const rule = { type: "test", max: 1, windowMs: 60_000, blockMs: 60_000 };
  const makePool = (rows) => ({
    getConnection: async () => ({
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
      execute: async (sql) => sql.includes("SELECT") ? [rows, []] : [{ affectedRows: 1 }, []]
    })
  });

  const started = await rateLimitService.consume(makePool([]), "login_account", "a@example.com", { rule, now });
  const repeated = await rateLimitService.consume(makePool([{
    window_started_at: now,
    hit_count: 1,
    blocked_until: new Date(now.getTime() + 30_000)
  }]), "login_account", "a@example.com", { rule, now });

  assert.equal(started.blocked, true);
  assert.equal(started.blockStarted, true);
  assert.equal(repeated.blocked, true);
  assert.equal(repeated.blockStarted, false);
  assert.equal(repeated.blockedRequest, true);
});
