const quizQueries = require("../queries/quizQueries");

async function submitQuiz(pool, userId, courseId, answers = {}, submissionKey) {
  const questions = await quizQueries.listForCourse(pool, courseId, true);
  if (!questions.length) return { ok: false, reason: "empty" };

  const selected = [];
  for (const question of questions) {
    const optionId = Number(answers[String(question.id)]);
    const option = question.options.find((item) => Number(item.id) === optionId);
    if (!option) return { ok: false, reason: "invalid" };
    selected.push({
      questionId: question.id,
      optionId: option.id,
      correct: Number(option.is_correct) === 1
    });
  }

  const correct = selected.filter((answer) => answer.correct).length;
  const score = Math.round((correct / questions.length) * 10000) / 100;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const attemptId = await quizQueries.createAttempt(
      connection,
      userId,
      courseId,
      correct,
      questions.length,
      score,
      submissionKey
    );
    for (const answer of selected) {
      await quizQueries.saveAnswer(
        connection,
        attemptId,
        answer.questionId,
        answer.optionId,
        answer.correct
      );
    }
    await connection.commit();
    return { ok: true, attemptId };
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      const existing = await quizQueries.findAttemptBySubmissionKey(
        pool,
        userId,
        courseId,
        submissionKey
      );
      if (existing) return { ok: true, attemptId: existing.id, duplicate: true };
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { submitQuiz };