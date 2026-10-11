process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test-only";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const reviewQueries = require("../src/queries/reviewQueries");
const { updateReviewVisibility } = require("../src/routes/courseReviews");

test("review visibility update is constrained by both review id and course id", async () => {
  let received;
  const pool = {
    execute: async (sql, params) => {
      received = { sql, params };
      return [{ affectedRows: 1 }];
    }
  };

  await reviewQueries.setVisibility(pool, 12, 8, true);

  assert.match(received.sql, /UPDATE course_reviews/);
  assert.match(received.sql, /WHERE id = \? AND course_id = \?/);
  assert.deepEqual(received.params, [1, 12, 8]);
});

test("review from another course cannot be made visible", async () => {
  const originalFind = reviewQueries.findForAdmin;
  const originalSet = reviewQueries.setVisibility;
  let updateCalled = false;
  reviewQueries.findForAdmin = async () => null;
  reviewQueries.setVisibility = async () => {
    updateCalled = true;
    return { affectedRows: 1 };
  };

  try {
    const result = await updateReviewVisibility({}, 12, 99, true);
    assert.deepEqual(result, { ok: false, reason: "not_found" });
    assert.equal(updateCalled, false);
  } finally {
    reviewQueries.findForAdmin = originalFind;
    reviewQueries.setVisibility = originalSet;
  }
});

test("invalid review or course ids are rejected before querying", async () => {
  const originalFind = reviewQueries.findForAdmin;
  let queryCalled = false;
  reviewQueries.findForAdmin = async () => {
    queryCalled = true;
    return null;
  };

  try {
    assert.deepEqual(
      await updateReviewVisibility({}, 0, 8, true),
      { ok: false, reason: "not_found" }
    );
    assert.deepEqual(
      await updateReviewVisibility({}, 12, null, true),
      { ok: false, reason: "not_found" }
    );
    assert.equal(queryCalled, false);
  } finally {
    reviewQueries.findForAdmin = originalFind;
  }
});

test("unchanged visibility remains idempotent when the constrained review still exists", async () => {
  const originalFind = reviewQueries.findForAdmin;
  const originalSet = reviewQueries.setVisibility;
  let findCalls = 0;
  reviewQueries.findForAdmin = async () => {
    findCalls += 1;
    return { id: 12, course_id: 8, is_visible: 1 };
  };
  reviewQueries.setVisibility = async () => ({ affectedRows: 0 });

  try {
    const result = await updateReviewVisibility({}, 12, 8, true);
    assert.equal(result.ok, true);
    assert.equal(findCalls, 2);
  } finally {
    reviewQueries.findForAdmin = originalFind;
    reviewQueries.setVisibility = originalSet;
  }
});
