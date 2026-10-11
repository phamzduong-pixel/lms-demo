process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test-only";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const passwordResetService = require("../src/services/passwordResetService");
const userQueries = require("../src/queries/userQueries");
const { getLoginSessionMaxAge } = require("../src/routes/auth");

const secret = "unit-test-reset-secret";
const now = 1_700_000_000_000;
const user = {
  id: 7,
  full_name: "Học viên",
  email: "student@example.test",
  password_hash: "$2b$12$old-password-hash"
};

test("password reset token is valid once for the matching password hash and expiry", () => {
  const token = passwordResetService.createPasswordResetToken(user, { now, secret });

  assert.equal(passwordResetService.readPasswordResetUserId(token), 7);
  assert.equal(passwordResetService.verifyPasswordResetToken(token, user, { now: now + 1, secret }), true);
  assert.equal(passwordResetService.verifyPasswordResetToken(token, { ...user, password_hash: "changed" }, { now: now + 1, secret }), false);
  assert.equal(passwordResetService.verifyPasswordResetToken(token, user, {
    now: now + passwordResetService.RESET_TOKEN_TTL_MS + 1,
    secret
  }), false);
  assert.equal(passwordResetService.verifyPasswordResetToken(token + "x", user, { now, secret }), false);
});

test("password reset email uses the configured public URL without exposing the password hash", async () => {
  let message = null;
  const transport = {
    async sendMail(mail) {
      message = mail;
    }
  };
  const env = {
    APP_BASE_URL: "http://lms.example.test:8080",
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    MAIL_FROM: "no-reply@example.test"
  };
  const token = passwordResetService.createPasswordResetToken(user, { now, secret });

  const result = await passwordResetService.sendPasswordResetEmail(user, token, { env, transport });

  assert.deepEqual(result, { sent: true });
  assert.equal(message.to, user.email);
  assert.match(message.text, /http:\/\/lms\.example\.test:8080\/reset-password\?token=/);
  assert.doesNotMatch(message.text, /old-password-hash/);
});

test("password reset email stays disabled when SMTP is not configured", async () => {
  const result = await passwordResetService.sendPasswordResetEmail(user, "token", {
    env: { APP_BASE_URL: "http://localhost:8080" }
  });
  assert.deepEqual(result, { sent: false, reason: "not_configured" });
});

test("remember login selects the expected session lifetime", () => {
  assert.equal(getLoginSessionMaxAge(false), 8 * 60 * 60 * 1000);
  assert.equal(getLoginSessionMaxAge(true), 30 * 24 * 60 * 60 * 1000);
});

test("password update query binds the hash before the user id", async () => {
  let receivedSql = "";
  let receivedParams = [];
  const pool = {
    async execute(sql, params) {
      receivedSql = sql;
      receivedParams = params;
      return [{ affectedRows: 1 }];
    }
  };

  await userQueries.updatePassword(pool, 7, "new-hash");

  assert.equal(receivedSql, "UPDATE users SET password_hash = ? WHERE id = ?");
  assert.deepEqual(receivedParams, ["new-hash", 7]);
});
