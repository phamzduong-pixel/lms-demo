const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  getPublicCourse,
  enrollStudent,
  getStudentCourse,
  deleteCourse
} = require("../src/services/lmsService");
const progressQueries = require("../src/queries/progressQueries");

function enrollmentPool(courseRows, duplicate = false) {
  return {
    async execute(sql) {
      if (sql.includes("FROM courses")) return [courseRows];
      if (sql.includes("INSERT INTO enrollments")) {
        if (duplicate) {
          const error = new Error("duplicate");
          error.code = "ER_DUP_ENTRY";
          throw error;
        }
        return [{ insertId: 1 }];
      }
      throw new Error("Unexpected SQL: " + sql);
    }
  };
}

test("public catalog returns published course lessons without private content", async () => {
  const pool = {
    async execute(sql) {
      if (sql.includes("FROM courses")) return [[{ id: 8, title: "Published course", status: "published" }]];
      if (sql.includes("FROM lessons")) return [[{ id: 11, title: "Lesson one", position: 1 }]];
      throw new Error("Unexpected SQL: " + sql);
    }
  };

  const result = await getPublicCourse(pool, 8);
  assert.equal(result.course.status, "published");
  assert.deepEqual(result.lessons, [{ id: 11, title: "Lesson one", position: 1 }]);
  assert.equal(result.enrolled, false);
});

test("requires a published course and reports duplicate enrollment", async () => {
  assert.deepEqual(await enrollStudent(enrollmentPool([]), 3, 8), { ok: false, reason: "unpublished" });
  assert.deepEqual(await enrollStudent(enrollmentPool([{ id: 8 }]), 3, 8), { ok: true, reason: null });
  assert.deepEqual(await enrollStudent(enrollmentPool([{ id: 8 }], true), 3, 8), { ok: false, reason: "duplicate" });
});

test("blocks unregistered or draft course access", async () => {
  let lessonQueryCalled = false;
  const pool = {
    async execute(sql) {
      if (sql.includes("FROM enrollments")) return [[], []];
      lessonQueryCalled = true;
      return [[]];
    }
  };
  assert.equal(await getStudentCourse(pool, 3, 8), null);
  assert.equal(lessonQueryCalled, false);
});

test("returns lesson progress only for an enrolled published course", async () => {
  const pool = {
    async execute(sql) {
      if (sql.includes("FROM enrollments")) return [[{ id: 8, title: "Course", status: "published" }]];
      if (sql.includes("FROM lessons l")) return [[{ id: 11, title: "Lesson", content: "<script>text</script>", position: 1, completed: 0 }]];
      throw new Error("Unexpected SQL: " + sql);
    }
  };
  const result = await getStudentCourse(pool, 3, 8);
  assert.equal(result.lessons[0].content, "<script>text</script>");
  assert.equal(result.lessons[0].completed, 0);
});

test("marks a lesson complete only for a matching enrollment", async () => {
  let insertCalls = 0;
  const validPool = {
    async execute(sql) {
      if (sql.includes("SELECT l.id")) return [[{ id: 11 }]];
      if (sql.includes("INSERT IGNORE")) {
        insertCalls += 1;
        return [{ affectedRows: 1 }];
      }
      throw new Error("Unexpected SQL: " + sql);
    }
  };
  assert.equal(await progressQueries.completeForStudent(validPool, 3, 8, 11), true);
  assert.equal(insertCalls, 1);

  const blockedPool = {
    async execute(sql) {
      if (sql.includes("SELECT l.id")) return [[]];
      throw new Error("Completion insert must not run");
    }
  };
  assert.equal(await progressQueries.completeForStudent(blockedPool, 3, 8, 11), false);
});

test("removes completion only for a matching enrolled published lesson", async () => {
  let deleteCalls = 0;
  const validPool = {
    async execute(sql) {
      if (sql.includes("SELECT l.id")) return [[{ id: 11 }]];
      if (sql.includes("DELETE FROM lesson_progress")) {
        deleteCalls += 1;
        return [{ affectedRows: 1 }];
      }
      throw new Error("Unexpected SQL: " + sql);
    }
  };
  assert.equal(await progressQueries.uncompleteForStudent(validPool, 3, 8, 11), true);
  assert.equal(deleteCalls, 1);

  const blockedPool = {
    async execute(sql) {
      if (sql.includes("SELECT l.id")) return [[]];
      throw new Error("Progress deletion must not run");
    }
  };
  assert.equal(await progressQueries.uncompleteForStudent(blockedPool, 3, 8, 11), false);
});

test("blocks deletion when SQL reports enrolled students and allows an empty course", async () => {
  let deleteSql = "";
  const blockedPool = {
    async execute(sql) {
      if (sql.includes("SELECT id, title, description") && sql.includes("FROM courses WHERE id")) return [[{ id: 8, title: "Course" }]];
      if (sql.includes("DELETE FROM courses")) {
        deleteSql = sql;
        return [{ affectedRows: 0 }];
      }
      if (sql.includes("COUNT(*) AS enrollment_count")) return [[{ enrollment_count: 2 }]];
      throw new Error("Unexpected SQL: " + sql);
    }
  };

  const blocked = await deleteCourse(blockedPool, 8);
  assert.deepEqual(blocked, { ok: false, reason: "has_enrollments", enrollmentCount: 2 });
  assert.match(deleteSql, /NOT EXISTS/);

  const emptyPool = {
    async execute(sql) {
      if (sql.includes("SELECT id, title, description") && sql.includes("FROM courses WHERE id")) return [[{ id: 9, title: "Empty course" }]];
      if (sql.includes("DELETE FROM courses")) return [{ affectedRows: 1 }];
      throw new Error("Unexpected SQL: " + sql);
    }
  };

  assert.deepEqual(await deleteCourse(emptyPool, 9), { ok: true, reason: null });
});