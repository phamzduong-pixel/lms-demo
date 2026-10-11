const test = require("node:test");
const assert = require("node:assert/strict");
const queries = require("../src/queries/securityQueries");

test("important security filter is parameterized and uses last seen time", () => {
  const result = queries.buildFilters({ importantOnly: true, severity: "warning", from: "2026-10-01" });
  assert.match(result.clause, /last_seen_at/);
  assert.match(result.clause, /event_type IN/);
  assert.match(result.clause, /severity = \?/);
  assert.equal(result.values.at(-1), "warning");
});

test("security event list selects grouping metadata and defaults to twenty rows", async () => {
  let call;
  const pool = { execute: async (...args) => { call = args; return [[], []]; } };
  await queries.listEvents(pool, { importantOnly: false });
  assert.match(call[0], /occurrence_count/);
  assert.match(call[0], /first_seen_at/);
  assert.match(call[0], /last_seen_at/);
  assert.deepEqual(call[1], [20, 0]);
});
