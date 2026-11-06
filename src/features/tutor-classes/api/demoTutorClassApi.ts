import { sampleClasses } from "../../classes/data/mockClasses";
import { getDemoOutline } from "../../classes/api/demoClassApi";
import type {
  CreateTutorClass,
  ContentVisibility,
  MaterialKind,
  TutorChapter,
  TutorClass,
  TutorClassPage,
  TutorLesson,
  TutorMaterial,
  TutorMember,
  TutorMemberPage,
  TutorOutline,
} from "../types";

const classes = new Map<string, TutorClass>(sampleClasses.map((item, index) => [item.class_id, {
  class_id: item.class_id,
  tutor_id: item.tutor.user_id,
  class_code: item.class_code,
  title: item.title,
  description: item.description,
  prerequisites_description: item.prerequisites_description,
  max_capacity: item.max_capacity,
  enrollment_policy: item.enrollment_policy,
  status: item.status,
  thumbnail_url: item.thumbnail_url,
  created_at: new Date(Date.UTC(2026, 9, 20 - index)).toISOString(),
  updated_at: new Date(Date.UTC(2026, 9, 20 - index)).toISOString(),
}]));

const members = new Map<string, TutorMember[]>(sampleClasses.map((item) => [item.class_id, [
  { class_member_id: `demo-active-${item.class_id}`, class_id: item.class_id, student_id: "student-olivia", status: "ACTIVE", requested_at: null, joined_at: "2026-10-05T09:00:00Z" },
  { class_member_id: `demo-pending-${item.class_id}`, class_id: item.class_id, student_id: "student-maya", status: "PENDING", requested_at: "2026-10-15T03:24:00Z", joined_at: null },
]]));

const outlines = new Map<string, TutorOutline>(sampleClasses.map((item) => {
  const source = getDemoOutline(item.class_id);
  return [item.class_id, {
    class_id: source.class_id,
    chapters: source.chapters.map((chapter) => ({
      ...chapter,
      lessons: chapter.lessons.map((lesson) => ({
        ...lesson,
        estimated_duration: lesson.estimated_duration ?? null,
      })),
    })),
  }];
}));

export function getDemoTutorClasses(query: { page?: number; size?: number; sort?: string } = {}): TutorClassPage {
  const items = [...classes.values()];
  if (query.sort === "created_at,asc") items.reverse();
  else items.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const page = Math.max(1, query.page ?? 1);
  const size = Math.max(1, query.size ?? 20);
  return { items: items.slice((page - 1) * size, page * size), page, size, total_items: items.length, total_pages: Math.ceil(items.length / size) };
}

export function createDemoTutorClass(payload: CreateTutorClass): TutorClass {
  const now = new Date().toISOString();
  const classId = `demo-class-${Date.now()}`;
  const created: TutorClass = {
    class_id: classId,
    tutor_id: "demo-tutor",
    class_code: payload.class_code,
    title: payload.title,
    description: payload.description ?? null,
    prerequisites_description: payload.prerequisites_description ?? null,
    max_capacity: payload.max_capacity ?? null,
    enrollment_policy: payload.enrollment_policy,
    status: "ACTIVE",
    thumbnail_url: null,
    created_at: now,
    updated_at: now,
  };
  classes.set(classId, created);
  members.set(classId, []);
  outlines.set(classId, { class_id: classId, chapters: [] });
  return created;
}

export function updateDemoTutorClass(classId: string, payload: Partial<Pick<TutorClass, "title" | "description" | "prerequisites_description" | "max_capacity" | "status">> & { enrollment_policy?: TutorClass["enrollment_policy"] }) {
  const current = classes.get(classId);
  if (!current) throw new Error("Demo class not found.");
  const updated = { ...current, ...payload, updated_at: new Date().toISOString() };
  classes.set(classId, updated);
  return updated;
}

export function getDemoTutorClassMembers(classId: string, query: { status?: "PENDING" | "ACTIVE"; page?: number; size?: number } = {}): TutorMemberPage {
  let items = members.get(classId) ?? [];
  if (query.status) items = items.filter((item) => item.status === query.status);
  const page = Math.max(1, query.page ?? 1);
  const size = Math.max(1, query.size ?? 20);
  return { items: items.slice((page - 1) * size, page * size), page, size, total_items: items.length, total_pages: Math.ceil(items.length / size) };
}

export function updateDemoTutorMember(classId: string, memberId: string, action: "approve" | "reject" | "remove") {
  const list = members.get(classId) ?? [];
  const member = list.find((item) => item.class_member_id === memberId);
  if (!member) throw new Error("Demo membership not found.");
  if (action === "remove" || action === "reject") {
    members.set(classId, list.filter((item) => item.class_member_id !== memberId));
  } else {
    member.status = "ACTIVE";
    member.joined_at = new Date().toISOString();
    member.requested_at = null;
  }
}

export function getDemoTutorOutline(classId: string): TutorOutline {
  const result = outlines.get(classId);
  if (!result) throw new Error("Demo class content not found.");
  return structuredClone(result);
}

export function saveDemoChapter(classId: string, chapterId: string | undefined, payload: { title: string; description?: string | null; sequence_order: number; status: ContentVisibility }) {
  const outline = requireOutline(classId);
  if (chapterId) {
    const chapter = findChapter(chapterId);
    Object.assign(chapter, payload, { description: payload.description ?? null });
    return chapter;
  }
  const chapter: TutorChapter = { chapter_id: makeId("chapter"), class_id: classId, title: payload.title, description: payload.description ?? null, sequence_order: payload.sequence_order, status: payload.status, lessons: [] };
  outline.chapters.push(chapter);
  return chapter;
}

export function removeDemoChapter(chapterId: string) {
  const outline = requireOutlineForChapter(chapterId);
  outline.chapters = outline.chapters.filter((item) => item.chapter_id !== chapterId);
}

export function saveDemoLesson(chapterId: string, lessonId: string | undefined, payload: { title: string; description?: string | null; estimated_duration?: number | null; sequence_order: number; status: ContentVisibility }) {
  const chapter = findChapter(chapterId);
  if (lessonId) {
    const lesson = findLesson(lessonId);
    Object.assign(lesson, payload, { description: payload.description ?? null });
    return lesson;
  }
  const lesson: TutorLesson = { lesson_id: makeId("lesson"), chapter_id: chapterId, title: payload.title, description: payload.description ?? null, estimated_duration: payload.estimated_duration ?? null, sequence_order: payload.sequence_order, status: payload.status, materials: [] };
  chapter.lessons.push(lesson);
  return lesson;
}

export function removeDemoLesson(lessonId: string) {
  const chapter = requireOutlineForLesson(lessonId);
  chapter.lessons = chapter.lessons.filter((item) => item.lesson_id !== lessonId);
}

export function saveDemoMaterial(lessonId: string, materialId: string | undefined, payload: { title: string; material_type: MaterialKind; file_url?: string | null; content?: string | null; sequence_order: number; status: ContentVisibility }) {
  const lesson = findLesson(lessonId);
  if (materialId) {
    const material = findMaterial(materialId);
    Object.assign(material, payload, { file_url: payload.file_url ?? null, content: payload.content ?? null });
    return material;
  }
  const material: TutorMaterial = { material_id: makeId("material"), lesson_id: lessonId, title: payload.title, material_type: payload.material_type, file_url: payload.file_url ?? null, content: payload.content ?? null, sequence_order: payload.sequence_order, status: payload.status };
  lesson.materials.push(material);
  return material;
}

export function removeDemoMaterial(materialId: string) {
  const lesson = requireOutlineForMaterial(materialId);
  lesson.materials = lesson.materials.filter((item) => item.material_id !== materialId);
}

export function updateDemoContentStatus(id: string, status: ContentVisibility) {
  const chapter = findOptionalChapter(id);
  if (chapter) { chapter.status = status; return; }
  const lesson = findOptionalLesson(id);
  if (lesson) { lesson.status = status; return; }
  const material = findOptionalMaterial(id);
  if (material) { material.status = status; return; }
  throw new Error("Demo content item not found.");
}

export function reorderDemoChapters(classId: string, chapterIds: string[]) {
  const outline = requireOutline(classId);
  outline.chapters = chapterIds.map((id, index) => ({ ...findChapter(id), sequence_order: index }));
}

export function reorderDemoLessons(chapterId: string, lessonIds: string[]) {
  const chapter = findChapter(chapterId);
  chapter.lessons = lessonIds.map((id, index) => ({ ...findLesson(id), sequence_order: index }));
}

function makeId(kind: string) { return `demo-${kind}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`; }
function requireOutline(classId: string) { const item = outlines.get(classId); if (!item) throw new Error("Demo class content not found."); return item; }
function findOptionalChapter(id: string) { for (const outline of outlines.values()) { const item = outline.chapters.find((chapter) => chapter.chapter_id === id); if (item) return item; } }
function findOptionalLesson(id: string) { for (const outline of outlines.values()) { for (const chapter of outline.chapters) { const item = chapter.lessons.find((lesson) => lesson.lesson_id === id); if (item) return item; } } }
function findOptionalMaterial(id: string) { for (const outline of outlines.values()) { for (const chapter of outline.chapters) { for (const lesson of chapter.lessons) { const item = lesson.materials.find((material) => material.material_id === id); if (item) return item; } } } }
function findChapter(id: string) { const item = findOptionalChapter(id); if (!item) throw new Error("Demo chapter not found."); return item; }
function findLesson(id: string) { const item = findOptionalLesson(id); if (!item) throw new Error("Demo lesson not found."); return item; }
function findMaterial(id: string) { const item = findOptionalMaterial(id); if (!item) throw new Error("Demo material not found."); return item; }
function requireOutlineForChapter(id: string) { for (const outline of outlines.values()) if (outline.chapters.some((item) => item.chapter_id === id)) return outline; throw new Error("Demo chapter not found."); }
function requireOutlineForLesson(id: string) { for (const outline of outlines.values()) for (const chapter of outline.chapters) if (chapter.lessons.some((item) => item.lesson_id === id)) return chapter; throw new Error("Demo lesson not found."); }
function requireOutlineForMaterial(id: string) { for (const outline of outlines.values()) for (const chapter of outline.chapters) for (const lesson of chapter.lessons) if (lesson.materials.some((item) => item.material_id === id)) return lesson; throw new Error("Demo material not found."); }
