process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test-only";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  buildLessonNavigation,
  filterCourses,
  getContinueLearningUrl,
  getCourseLearningState
} = require("../src/routes/studentCourses");

test("student lesson navigation identifies current, previous and next lessons", () => {
  const lessons = [
    { id: 10, title: "Mở đầu", position: 1 },
    { id: 12, title: "Thực hành", position: 2 },
    { id: 14, title: "Tổng kết", position: 3 }
  ];

  const navigation = buildLessonNavigation(lessons, 12);

  assert.equal(navigation.currentLesson.title, "Thực hành");
  assert.equal(navigation.previousLesson.id, 10);
  assert.equal(navigation.nextLesson.id, 14);
  assert.equal(buildLessonNavigation(lessons, 99), null);
});

test("first and last lessons have only the available navigation link", () => {
  const lessons = [{ id: 1, title: "Một bài", position: 1 }];
  const navigation = buildLessonNavigation(lessons, 1);

  assert.equal(navigation.previousLesson, null);
  assert.equal(navigation.nextLesson, null);
});

test("learning filters keep zero-lesson courses separate from completed courses", () => {
  const courses = [
    { id: 1, total_lessons: 0, completed_lessons: 0 },
    { id: 2, total_lessons: 3, completed_lessons: 0 },
    { id: 3, total_lessons: 3, completed_lessons: 1 },
    { id: 4, total_lessons: 3, completed_lessons: 3 }
  ];

  assert.equal(getCourseLearningState(courses[0]), "no_lessons");
  assert.equal(getCourseLearningState(courses[1]), "not_started");
  assert.equal(getCourseLearningState(courses[2]), "in_progress");
  assert.equal(getCourseLearningState(courses[3]), "completed");
  assert.deepEqual(filterCourses(courses, "not_started").map((course) => course.id), [2]);
  assert.deepEqual(filterCourses(courses, "in_progress").map((course) => course.id), [3]);
  assert.deepEqual(filterCourses(courses, "completed").map((course) => course.id), [4]);
});

test("continue learning points to the first incomplete lesson or the course overview", () => {
  assert.equal(
    getContinueLearningUrl({ id: 5, total_lessons: 3, next_lesson_id: 9 }),
    "/student/courses/5/lessons/9"
  );
  assert.equal(
    getContinueLearningUrl({ id: 5, total_lessons: 3, next_lesson_id: null }),
    "/student/courses/5"
  );
  assert.equal(
    getContinueLearningUrl({ id: 5, total_lessons: 0, next_lesson_id: null }),
    "/student/courses/5"
  );
});