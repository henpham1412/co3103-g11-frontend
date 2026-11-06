import assert from "node:assert/strict";
import test from "node:test";

import { getLessonNavigation, getMaterialDisplay } from "../src/features/classes/student-lesson-model.mjs";

const outline = {
  chapters: [
    { chapter_id: "chapter-a", title: "A", lessons: [{ lesson_id: "lesson-1" }, { lesson_id: "lesson-2" }] },
    { chapter_id: "chapter-b", title: "B", lessons: [{ lesson_id: "lesson-3" }] },
  ],
};

test("lesson navigation follows chapter and lesson order", () => {
  const navigation = getLessonNavigation(outline, "lesson-2");
  assert.equal(navigation.previous.lesson_id, "lesson-1");
  assert.equal(navigation.current.chapter_title, "A");
  assert.equal(navigation.next.lesson_id, "lesson-3");
});

test("lesson navigation has no previous/next outside the outline boundaries", () => {
  assert.equal(getLessonNavigation(outline, "lesson-1").previous, undefined);
  assert.equal(getLessonNavigation(outline, "lesson-3").next, undefined);
  assert.equal(getLessonNavigation(outline, "hidden-lesson").current, undefined);
});

test("only text and valid HTTPS links are directly rendered as materials", () => {
  assert.equal(getMaterialDisplay({ material_type: "TEXT", content: "Notes" }), "text");
  assert.equal(getMaterialDisplay({ material_type: "URL", file_url: "https://example.org" }), "link");
  assert.equal(getMaterialDisplay({ material_type: "URL", file_url: "javascript:alert(1)" }), "invalid");
  assert.equal(getMaterialDisplay({ material_type: "DOCUMENT", file_url: "https://example.org/file.pdf" }), "file-unavailable");
  assert.equal(getMaterialDisplay({ material_type: "VIDEO", file_url: "https://example.org/video.mp4" }), "file-unavailable");
});
