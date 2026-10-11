process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test-only";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const router = require("../src/routes/adminSecurity");
const securityQueries = require("../src/queries/securityQueries");

function routeHandler() {
  const layer = router.stack.find((item) => item.route?.path === "/admin/security-events");
  assert.ok(layer, "security events route should be registered");
  return layer.route.stack.at(-1).handle;
}

test("security events query errors are propagated instead of rendered as an empty 200 page", async () => {
  const originalCount = securityQueries.countEvents;
  const originalList = securityQueries.listEvents;
  securityQueries.countEvents = async () => {
    const error = new Error("missing compaction column");
    error.code = "ER_BAD_FIELD_ERROR";
    throw error;
  };
  securityQueries.listEvents = originalList;

  const response = {
    render() {
      throw new Error("route must not render a fallback page");
    }
  };
  try {
    await assert.rejects(
      routeHandler()({ user: { role: "admin" }, query: {} }, response, () => {}),
      (error) => error.code === "ER_BAD_FIELD_ERROR"
    );
  } finally {
    securityQueries.countEvents = originalCount;
    securityQueries.listEvents = originalList;
  }
});
