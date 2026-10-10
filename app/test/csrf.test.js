const assert = require("node:assert/strict");
const { test } = require("node:test");
const { verifyCsrfToken } = require("../src/middleware/csrf");

const expectedToken = "a".repeat(64);
const wrongToken = "a".repeat(63) + "b";

function runVerification(submitted, expected = expectedToken) {
  let statusCode = null;
  let rendered = null;
  let nextCalls = 0;

  const req = {
    body: submitted === undefined ? {} : { _csrf: submitted },
    session: { csrfToken: expected }
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    render(view, data) {
      rendered = { view, data };
      return this;
    }
  };

  verifyCsrfToken(req, res, () => { nextCalls += 1; });
  return { statusCode, rendered, nextCalls };
}

test("accepts a valid 64-character lowercase hex token", () => {
  const result = runVerification(expectedToken);
  assert.equal(result.statusCode, null);
  assert.equal(result.rendered, null);
  assert.equal(result.nextCalls, 1);
});

test("rejects a missing token with HTTP 403", () => {
  const result = runVerification(undefined);
  assert.equal(result.statusCode, 403);
  assert.equal(result.nextCalls, 0);
});

test("rejects a wrong token with HTTP 403", () => {
  const result = runVerification(wrongToken);
  assert.equal(result.statusCode, 403);
  assert.equal(result.nextCalls, 0);
});

test("rejects a Unicode token with 64 characters but different byte length", () => {
  const unicodeToken = "é".repeat(64);
  assert.equal(unicodeToken.length, 64);
  assert.notEqual(Buffer.byteLength(unicodeToken, "utf8"), 64);

  const result = runVerification(unicodeToken);
  assert.equal(result.statusCode, 403);
  assert.equal(result.nextCalls, 0);
});

test("rejects a malformed token stored in the session with HTTP 403", () => {
  const result = runVerification(expectedToken, "A".repeat(64));
  assert.equal(result.statusCode, 403);
  assert.equal(result.nextCalls, 0);
});