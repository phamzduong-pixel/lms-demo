const crypto = require("node:crypto");
const nodemailer = require("nodemailer");

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(segment) {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function signPayload(payloadSegment, passwordHash, secret) {
  if (!secret) throw new Error("SESSION_SECRET bắt buộc để tạo token đặt lại mật khẩu");
  return crypto
    .createHmac("sha256", secret)
    .update(payloadSegment + "." + passwordHash)
    .digest("base64url");
}

function createPasswordResetToken(user, options = {}) {
  const now = options.now ?? Date.now();
  const secret = options.secret ?? process.env.SESSION_SECRET;
  const payloadSegment = encodePayload({
    userId: Number(user.id),
    expiresAt: now + RESET_TOKEN_TTL_MS
  });
  const signature = signPayload(payloadSegment, user.password_hash, secret);
  return payloadSegment + "." + signature;
}

function readPasswordResetUserId(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const payload = decodePayload(parts[0]);
  const userId = Number(payload && payload.userId);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

function verifyPasswordResetToken(token, user, options = {}) {
  if (typeof token !== "string" || !user) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return false;

  const payload = decodePayload(parts[0]);
  const now = options.now ?? Date.now();
  const secret = options.secret ?? process.env.SESSION_SECRET;
  if (!payload || Number(payload.userId) !== Number(user.id) ||
      !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt < now) return false;

  const expected = signPayload(parts[0], user.password_hash, secret);
  const submittedBuffer = Buffer.from(parts[1]);
  const expectedBuffer = Buffer.from(expected);
  return submittedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(submittedBuffer, expectedBuffer);
}

function passwordResetEmailConfigured(env = process.env) {
  const hasAuthPair = (!env.SMTP_USER && !env.SMTP_PASSWORD) ||
    Boolean(env.SMTP_USER && env.SMTP_PASSWORD);
  return Boolean(env.APP_BASE_URL && env.SMTP_HOST && env.MAIL_FROM && hasAuthPair);
}

function buildResetUrl(token, env = process.env) {
  const baseUrl = new URL(env.APP_BASE_URL);
  if (!/^https?:$/.test(baseUrl.protocol)) throw new Error("APP_BASE_URL phải dùng HTTP hoặc HTTPS");
  const resetUrl = new URL("/reset-password", baseUrl);
  resetUrl.searchParams.set("token", token);
  return resetUrl.toString();
}

function createTransport(env) {
  const transportOptions = {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === "true"
  };
  if (env.SMTP_USER && env.SMTP_PASSWORD) {
    transportOptions.auth = { user: env.SMTP_USER, pass: env.SMTP_PASSWORD };
  }
  return nodemailer.createTransport(transportOptions);
}

async function sendPasswordResetEmail(user, token, options = {}) {
  const env = options.env || process.env;
  if (!passwordResetEmailConfigured(env)) return { sent: false, reason: "not_configured" };

  const resetUrl = buildResetUrl(token, env);
  const transport = options.transport || createTransport(env);
  await transport.sendMail({
    from: env.MAIL_FROM,
    to: user.email,
    subject: "Đặt lại mật khẩu LMS Demo",
    text: [
      "Bạn đã yêu cầu đặt lại mật khẩu LMS Demo.",
      "Mở liên kết sau trong vòng 30 phút:",
      resetUrl,
      "Nếu bạn không gửi yêu cầu này, hãy bỏ qua email."
    ].join("\n\n")
  });
  return { sent: true };
}

module.exports = {
  RESET_TOKEN_TTL_MS,
  createPasswordResetToken,
  readPasswordResetUserId,
  verifyPasswordResetToken,
  passwordResetEmailConfigured,
  buildResetUrl,
  sendPasswordResetEmail
};
