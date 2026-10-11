process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test-only";
const path = require("node:path");
const ejs = require("ejs");
const { formData } = require("../src/routes/adminQuizzes");
const test = require("node:test");
const assert = require("node:assert/strict");
const quizQueries = require("../src/queries/quizQueries");

function transactionalPool(execute) {
  const calls = [];
  const connection = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return execute(sql, params);
    },
    beginTransaction: async () => calls.push({ type: "begin" }),
    commit: async () => calls.push({ type: "commit" }),
    rollback: async () => calls.push({ type: "rollback" }),
    release: () => calls.push({ type: "release" })
  };
  return { calls, getConnection: async () => connection };
}

test("quiz creation rolls back when inserting an option fails", async () => {
  let optionInsertCount = 0;
  const pool = transactionalPool((sql) => {
    if (sql.includes("INSERT INTO quiz_questions")) return [{ insertId: 10 }];
    optionInsertCount += 1;
    if (optionInsertCount === 2) throw new Error("option insert failed");
    return [{}];
  });

  await assert.rejects(
    quizQueries.create(pool, 4, {
      questionText: "Question",
      position: 1,
      options: ["A", "B", "C", "D"],
      correctIndex: 0
    }),
    /option insert failed/
  );
  assert.equal(pool.calls.some((call) => call.type === "commit"), false);
  assert.equal(pool.calls.filter((call) => call.type === "rollback").length, 1);
});

test("questions with submitted answers cannot be updated or removed", async () => {
  const operations = ["update", "remove"];

  for (const operation of operations) {
    const pool = transactionalPool((sql) => {
      if (sql.includes("SELECT id FROM quiz_questions")) return [[{ id: 10 }]];
      if (sql.includes("SELECT 1 FROM quiz_attempt_answers")) return [[{ 1: 1 }]];
      throw new Error("The operation reached a mutation unexpectedly");
    });
    const action = operation === "update"
      ? quizQueries.update(pool, 4, 10, {
          questionText: "Changed",
          position: 1,
          options: ["A", "B", "C", "D"],
          correctIndex: 0
        })
      : quizQueries.remove(pool, 4, 10);

    await assert.rejects(action, (error) => {
      assert.equal(error.code, "QUIZ_QUESTION_HAS_SUBMISSIONS");
      return true;
    });
    assert.equal(pool.calls.some((call) => call.type === "commit"), false);
    assert.equal(pool.calls.filter((call) => call.type === "rollback").length, 1);
  }
});
test("submitted history and selected answers remain readable", async () => {
  const pool = {
    execute: async (sql, params) => {
      assert.match(sql, /quiz_attempt_answers/);
      assert.deepEqual(params, [99]);
      return [[{
        question_text: "Question",
        selected_option: "A",
        is_correct: 1,
        correct_option: "A"
      }]];
    }
  };
  const answers = await quizQueries.attemptAnswers(pool, 99);
  assert.equal(answers[0].selected_option, "A");
  assert.equal(answers[0].correct_option, "A");
});
test("locked quiz edit normalizes old option rows for the 409 form", async () => {
  const form = formData(
    { id: 4, title: "Khóa học" },
    {
      id: 10,
      question_text: "Câu hỏi cũ",
      position: 2,
      options: [
        { id: 101, option_text: "Đáp án A", is_correct: 0 },
        { id: 102, option_text: "Đáp án B", is_correct: 1 },
        { id: 103, option_text: "Đáp án C", is_correct: 0 },
        { id: 104, option_text: "Đáp án D", is_correct: 0 }
      ]
    },
    "Không thể sửa câu hỏi vì đã có học viên nộp bài."
  );
  const html = await ejs.renderFile(
    path.join(__dirname, "..", "views", "admin", "quizzes", "form.ejs"),
    {
      ...form,
      currentUser: { id: 1, role: "admin", full_name: "Admin" },
      currentPath: "/admin/courses/4/quiz/questions/10/edit",
      csrfToken: "a".repeat(64),
      error: form.error,
      message: ""
    }
  );

  assert.equal(form.formAction, "/admin/courses/4/quiz/questions/10");
  assert.deepEqual(form.question.options, ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"]);
  assert.equal(form.question.correctOption, 2);
  assert.doesNotMatch(html, /\[object Object\]/);
  assert.match(html, /value="Đáp án B"/);
  assert.match(html, /value="2" selected/);
});