function quizHistoryError(message) {
  const error = new Error(message);
  error.code = "QUIZ_QUESTION_HAS_SUBMISSIONS";
  return error;
}

async function withTransaction(pool, work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listForCourse(pool, courseId, includeCorrect = false) {
  const [questions] = await pool.execute(
    "SELECT id, question_text, position FROM quiz_questions " +
      "WHERE course_id = ? ORDER BY position, id",
    [courseId]
  );

  for (const question of questions) {
    const [options] = await pool.execute(
      "SELECT id, option_text, position" +
        (includeCorrect ? ", is_correct" : "") +
        " FROM quiz_options WHERE question_id = ? ORDER BY position, id",
      [question.id]
    );
    question.options = options;
  }

  return questions;
}

async function findQuestion(pool, courseId, questionId) {
  const [rows] = await pool.execute(
    "SELECT id, course_id, question_text, position FROM quiz_questions " +
      "WHERE id = ? AND course_id = ?",
    [questionId, courseId]
  );
  if (!rows[0]) return null;

  const question = rows[0];
  const [options] = await pool.execute(
    "SELECT id, option_text, position, is_correct FROM quiz_options " +
      "WHERE question_id = ? ORDER BY position, id",
    [questionId]
  );
  question.options = options;
  return question;
}

async function hasSubmittedAnswers(pool, questionId) {
  const [rows] = await pool.execute(
    "SELECT 1 FROM quiz_attempt_answers WHERE question_id = ? LIMIT 1",
    [questionId]
  );
  return Boolean(rows[0]);
}

async function assertQuestionExists(connection, courseId, questionId) {
  const [rows] = await connection.execute(
    "SELECT id FROM quiz_questions WHERE id = ? AND course_id = ? FOR UPDATE",
    [questionId, courseId]
  );
  return Boolean(rows[0]);
}

async function assertNoSubmittedAnswers(connection, questionId) {
  const [rows] = await connection.execute(
    "SELECT 1 FROM quiz_attempt_answers WHERE question_id = ? LIMIT 1 FOR UPDATE",
    [questionId]
  );
  if (rows[0]) {
    throw quizHistoryError(
      "Không thể sửa hoặc xóa câu hỏi vì đã có học viên nộp bài; lịch sử bài làm được giữ nguyên."
    );
  }
}

async function insertOptions(connection, questionId, options, correctIndex) {
  for (let index = 0; index < options.length; index += 1) {
    await connection.execute(
      "INSERT INTO quiz_options " +
        "(question_id, option_text, is_correct, position) VALUES (?, ?, ?, ?)",
      [questionId, options[index], index === correctIndex ? 1 : 0, index + 1]
    );
  }
}

async function create(pool, courseId, values) {
  return withTransaction(pool, async (connection) => {
    const [result] = await connection.execute(
      "INSERT INTO quiz_questions " +
        "(course_id, question_text, position) VALUES (?, ?, ?)",
      [courseId, values.questionText, values.position]
    );
    await insertOptions(
      connection,
      result.insertId,
      values.options,
      values.correctIndex
    );
    return result;
  });
}

async function update(pool, courseId, questionId, values) {
  return withTransaction(pool, async (connection) => {
    if (!(await assertQuestionExists(connection, courseId, questionId))) {
      const error = new Error("Câu hỏi không tồn tại trong khóa học này.");
      error.code = "QUIZ_QUESTION_NOT_FOUND";
      throw error;
    }
    await assertNoSubmittedAnswers(connection, questionId);
    await connection.execute(
      "UPDATE quiz_questions SET question_text = ?, position = ? " +
        "WHERE id = ? AND course_id = ?",
      [values.questionText, values.position, questionId, courseId]
    );
    await connection.execute(
      "DELETE FROM quiz_options WHERE question_id = ?",
      [questionId]
    );
    await insertOptions(
      connection,
      questionId,
      values.options,
      values.correctIndex
    );
  });
}

async function remove(pool, courseId, questionId) {
  return withTransaction(pool, async (connection) => {
    if (!(await assertQuestionExists(connection, courseId, questionId))) {
      const error = new Error("Câu hỏi không tồn tại trong khóa học này.");
      error.code = "QUIZ_QUESTION_NOT_FOUND";
      throw error;
    }
    await assertNoSubmittedAnswers(connection, questionId);
    return connection.execute(
      "DELETE FROM quiz_questions WHERE id = ? AND course_id = ?",
      [questionId, courseId]
    );
  });
}

async function createAttempt(
  connection,
  userId,
  courseId,
  correct,
  total,
  score,
  submissionKey
) {
  const [result] = await connection.execute(
    "INSERT INTO quiz_attempts " +
      "(user_id, course_id, correct_count, total_questions, score, submission_key) " +
      "VALUES (?, ?, ?, ?, ?, ?)",
    [userId, courseId, correct, total, score, submissionKey]
  );
  return result.insertId;
}
async function saveAnswer(connection, attemptId, questionId, optionId, isCorrect) {
  return connection.execute(
    "INSERT INTO quiz_attempt_answers " +
      "(attempt_id, question_id, option_id, is_correct) VALUES (?, ?, ?, ?)",
    [attemptId, questionId, optionId, isCorrect ? 1 : 0]
  );
}

async function listAttempts(pool, userId, courseId) {
  const [rows] = await pool.execute(
    "SELECT id, submitted_at, correct_count, total_questions, score " +
      "FROM quiz_attempts WHERE user_id = ? AND course_id = ? " +
      "ORDER BY submitted_at DESC, id DESC",
    [userId, courseId]
  );
  return rows;
}

async function findAttempt(pool, userId, courseId, attemptId) {
  const [rows] = await pool.execute(
    "SELECT id, submitted_at, correct_count, total_questions, score " +
      "FROM quiz_attempts WHERE id = ? AND user_id = ? AND course_id = ?",
    [attemptId, userId, courseId]
  );
  return rows[0] || null;
}

async function findAttemptBySubmissionKey(pool, userId, courseId, submissionKey) {
  const [rows] = await pool.execute(
    "SELECT id FROM quiz_attempts WHERE user_id = ? AND course_id = ? " +
      "AND submission_key = ?",
    [userId, courseId, submissionKey]
  );
  return rows[0] || null;
}
async function attemptAnswers(pool, attemptId) {
  const [rows] = await pool.execute(
    "SELECT q.question_text, qo.option_text AS selected_option, " +
      "aa.is_correct, (SELECT option_text FROM quiz_options correct_option " +
      "WHERE correct_option.question_id = q.id AND correct_option.is_correct = 1 " +
      "LIMIT 1) AS correct_option " +
      "FROM quiz_attempt_answers aa " +
      "INNER JOIN quiz_questions q ON q.id = aa.question_id " +
      "INNER JOIN quiz_options qo ON qo.id = aa.option_id " +
      "WHERE aa.attempt_id = ? ORDER BY q.position, q.id",
    [attemptId]
  );
  return rows;
}

async function listResultsForAdmin(pool, courseId) {
  const [rows] = await pool.execute(
    "SELECT a.id, a.submitted_at, a.correct_count, a.total_questions, a.score, " +
      "u.id AS user_id, u.full_name, u.email " +
      "FROM quiz_attempts a INNER JOIN users u ON u.id = a.user_id " +
      "WHERE a.course_id = ? ORDER BY a.submitted_at DESC, a.id DESC",
    [courseId]
  );
  return rows;
}


async function findAttemptForAdmin(pool, courseId, attemptId) {
  const [rows] = await pool.execute(
    "SELECT a.id, a.course_id, a.user_id, a.submitted_at, " +
      "a.correct_count, a.total_questions, a.score, " +
      "u.full_name, u.email, c.title AS course_title " +
      "FROM quiz_attempts a " +
      "INNER JOIN users u ON u.id = a.user_id " +
      "INNER JOIN courses c ON c.id = a.course_id " +
      "WHERE a.id = ? AND a.course_id = ?",
    [attemptId, courseId]
  );
  return rows[0] || null;
}

async function attemptAnswersForAdmin(pool, courseId, attemptId) {
  const [rows] = await pool.execute(
    "SELECT q.id AS question_id, q.position, q.question_text, " +
      "qo.option_text AS selected_option, aa.is_correct, " +
      "(SELECT option_text FROM quiz_options correct_option " +
        "WHERE correct_option.question_id = q.id " +
          "AND correct_option.is_correct = 1 LIMIT 1) AS correct_option " +
      "FROM quiz_attempt_answers aa " +
      "INNER JOIN quiz_attempts a ON a.id = aa.attempt_id " +
        "AND a.course_id = ? " +
      "INNER JOIN quiz_questions q ON q.id = aa.question_id " +
        "AND q.course_id = a.course_id " +
      "INNER JOIN quiz_options qo ON qo.id = aa.option_id " +
        "AND qo.question_id = aa.question_id " +
      "WHERE aa.attempt_id = ? ORDER BY q.position, q.id",
    [courseId, attemptId]
  );
  return rows;
}

module.exports = {
  listForCourse,
  findQuestion,
  create,
  update,
  remove,
  createAttempt,
  saveAnswer,
  listAttempts,
  findAttempt,
  findAttemptBySubmissionKey,
  attemptAnswers,
  listResultsForAdmin,
  findAttemptForAdmin,
  attemptAnswersForAdmin,
  hasSubmittedAnswers,
  quizHistoryError
};