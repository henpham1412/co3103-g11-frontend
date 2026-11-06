import { isHttpsUrl, isStoredMaterialFile } from "./material-source";
import type { ClassOutlineLesson, ClassOutlineMaterial, ClassOutlineResponse } from "./types";

export interface NavigableLesson extends ClassOutlineLesson {
  chapter_id: string;
  chapter_title: string;
}

export type MaterialDisplay = "text" | "link" | "file" | "unavailable";

export function getLessonNavigation(
  outline: ClassOutlineResponse | undefined,
  lessonId: string,
): { current?: NavigableLesson; previous?: NavigableLesson; next?: NavigableLesson } {
  const lessons = (outline?.chapters ?? []).flatMap((chapter) =>
    (chapter.lessons ?? []).map((lesson) => ({
      ...lesson,
      chapter_id: chapter.chapter_id,
      chapter_title: chapter.title,
    })),
  );
  const index = lessons.findIndex((lesson) => lesson.lesson_id === lessonId);

  if (index < 0) return {};
  return { current: lessons[index], previous: lessons[index - 1], next: lessons[index + 1] };
}

export function getMaterialDisplay(material: ClassOutlineMaterial): MaterialDisplay {
  if (material.material_type === "TEXT") return material.content ? "text" : "unavailable";
  if (!material.file_url) return "unavailable";
  // An uploaded DOCUMENT or VIDEO is an attachment behind the API; a VIDEO can also carry an
  // external YouTube/Vimeo/.mp4 address, which the LMS neither hosts nor streams.
  if (isStoredMaterialFile(material.file_url)) return "file";
  return isHttpsUrl(material.file_url) ? "link" : "unavailable";
}
