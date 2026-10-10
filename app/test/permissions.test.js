process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test-only";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { requireRole } = require("../src/middleware/auth");

function responseDouble() {
  return {
    statusCode: null,
    redirectedTo: null,
    status(code) { this.statusCode = code; return this; },
    render() { return this; },
    redirect(path) { this.redirectedTo = path; return this; }
  };
}

test("role middleware allows matching role and denies other roles", () => {
  let nextCalls = 0;
  const allowedReq = { user: { role: "admin" } };
  const allowedRes = responseDouble();
  requireRole("admin")(allowedReq, allowedRes, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);

  const deniedRes = responseDouble();
  requireRole("admin")({ user: { role: "student" } }, deniedRes, () => { nextCalls += 1; });
  assert.equal(deniedRes.statusCode, 403);
  assert.equal(nextCalls, 1);
});

test("role middleware redirects guests to login", () => {
  const res = responseDouble();
  requireRole("student")({ user: null, originalUrl: "/student" }, res, () => {});
  assert.equal(res.redirectedTo, "/login?next=%2Fstudent");
});