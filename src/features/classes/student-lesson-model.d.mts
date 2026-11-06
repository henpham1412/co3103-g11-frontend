import type { ClassOutlineLesson, ClassOutlineResponse, ClassOutlineMaterial } from "./types";

export interface NavigableLesson extends ClassOutlineLesson {
  chapter_id: string;
  chapter_title: string;
}

export function getLessonNavigation(
  outline: ClassOutlineResponse | undefined,
  lessonId: string,
): { current: NavigableLesson | undefined; previous: NavigableLesson | undefined; next: NavigableLesson | undefined };

export function getMaterialDisplay(material: ClassOutlineMaterial): "text" | "link" | "file-unavailable" | "invalid";
