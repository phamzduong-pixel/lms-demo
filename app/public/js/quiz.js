(() => {
  const form = document.querySelector("[data-quiz-form]");
  if (!form) return;

  const questions = [...form.querySelectorAll("[data-question-id]")];
  const progress = form.querySelector("[data-quiz-progress]");
  const count = form.querySelector("[data-answer-count]");
  const status = form.querySelector("[data-quiz-status]");
  const submit = form.querySelector("[data-quiz-submit]");

  function updateProgress() {
    const answered = questions.filter((question) =>
      question.querySelector('input[type="radio"]:checked')
    );

    if (progress) progress.value = answered.length;
    if (count) {
      count.textContent =
        "\u0110\u00e3 tr\u1ea3 l\u1eddi " + answered.length + "/" + questions.length + " c\u00e2u";
    }

    questions.forEach((question) => {
      const answeredQuestion = answered.includes(question);
      const questionLink = form.querySelector(
        '[data-question-link="' + question.dataset.questionId + '"]'
      );
      question.classList.toggle("is-answered", answeredQuestion);
      question.classList.remove("has-missing-answer");
      if (questionLink) questionLink.classList.toggle("is-answered", answeredQuestion);
    });
  }

  form.addEventListener("change", (event) => {
    if (!event.target.matches('input[type="radio"]')) return;
    const fieldset = event.target.closest("[data-question-id]");
    if (fieldset) {
      fieldset
        .querySelectorAll(".quiz-option")
        .forEach((option) => option.classList.remove("is-selected"));
      event.target.closest(".quiz-option").classList.add("is-selected");
    }
    updateProgress();
  });

  form.addEventListener("submit", (event) => {
    const missing = questions.filter(
      (question) => !question.querySelector('input[type="radio"]:checked')
    );

    if (missing.length) {
      event.preventDefault();
      missing.forEach((question) => question.classList.add("has-missing-answer"));
      if (status) {
        status.textContent =
          "B\u1ea1n c\u00f2n thi\u1ebfu " + missing.length + " c\u00e2u tr\u1ea3 l\u1eddi.";
      }
      missing[0].scrollIntoView({ behavior: "smooth", block: "center" });
      missing[0].querySelector('input[type="radio"]').focus();
      return;
    }

    if (submit) {
      submit.disabled = true;
      submit.textContent = "\u0110ang n\u1ed9p\u2026";
    }
    if (status) status.textContent = "\u0110ang l\u01b0u b\u00e0i l\u00e0m c\u1ee7a b\u1ea1n\u2026";
  });

  window.addEventListener("pageshow", () => {
    if (!submit || !submit.disabled) return;
    submit.disabled = false;
    submit.textContent = "N\u1ed9p b\u00e0i";
    if (status) status.textContent = "";
  });

  updateProgress();
})();
