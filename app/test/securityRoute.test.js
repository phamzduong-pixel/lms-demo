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

test("security events route is hidden and does not query audit data", async () => {
  const originalCount = securityQueries.countEvents;
  const originalList = securityQueries.listEvents;
  let countCalled = false;
  let listCalled = false;
  securityQueries.countEvents = async () => {
    countCalled = true;
  };
  securityQueries.listEvents = async () => {
    listCalled = true;
  };

  let statusCode;
  let rendered;
  const response = {
    status(status) {
      statusCode = status;
      return this;
    },
    render(view, data) {
      rendered = { view, data };
    }
  };
  try {
    await routeHandler()({ user: { role: "admin" }, query: {} }, response, () => {});
    assert.equal(statusCode, 404);
    assert.equal(rendered.view, "error");
    assert.equal(rendered.data.title, "Không tìm thấy trang");
    assert.equal(countCalled, false);
    assert.equal(listCalled, false);
  } finally {
    securityQueries.countEvents = originalCount;
    securityQueries.listEvents = originalList;
  }
});
