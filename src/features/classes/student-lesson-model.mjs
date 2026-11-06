export function getLessonNavigation(outline, lessonId) {
  const lessons = (outline?.chapters ?? []).flatMap((chapter) =>
    (chapter.lessons ?? []).map((lesson) => ({
      ...lesson,
      chapter_id: chapter.chapter_id,
      chapter_title: chapter.title,
    })),
  );
  const index = lessons.findIndex((lesson) => lesson.lesson_id === lessonId);

  if (index < 0) return { current: undefined, previous: undefined, next: undefined };
  return {
    current: lessons[index],
    previous: lessons[index - 1],
    next: lessons[index + 1],
  };
}

export function getMaterialDisplay(material) {
  if (material.material_type === "TEXT" && material.content) return "text";
  if (material.material_type === "URL" && isHttpsUrl(material.file_url)) return "link";
  if (material.material_type === "DOCUMENT" || material.material_type === "VIDEO") {
    return "file-unavailable";
  }
  return "invalid";
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
