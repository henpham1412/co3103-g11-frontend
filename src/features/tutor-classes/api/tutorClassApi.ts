import { lmsClient } from "../../../api/lmsClient";
import type { EnrollmentPolicy } from "../../classes/types";
import type {
  CreateTutorClass,
  ContentVisibility,
  MaterialKind,
  TutorOutline,
  TutorClass,
  TutorClassPage,
  TutorMemberPage,
} from "../types";
import {
  createDemoTutorClass,
  getDemoTutorClasses,
  getDemoTutorClassMembers,
  getDemoTutorOutline,
  removeDemoChapter,
  removeDemoLesson,
  removeDemoMaterial,
  reorderDemoChapters,
  reorderDemoLessons,
  saveDemoChapter,
  saveDemoLesson,
  saveDemoMaterial,
  updateDemoTutorClass,
  updateDemoTutorMember,
} from "./demoTutorClassApi";

export async function getTutorClasses(
  query: { page?: number; size?: number; sort?: string } = {},
  signal?: AbortSignal,
) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return getDemoTutorClasses(query);
  const response = await lmsClient.get<TutorClassPage>("/tutor/classes", {
    params: query,
    signal,
  });
  return response.data;
}

export async function createTutorClass(payload: CreateTutorClass) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return createDemoTutorClass(payload);
  const response = await lmsClient.post<TutorClass>("/classes", payload);
  return response.data;
}

export async function updateTutorClass(
  classId: string,
  payload: Partial<Pick<TutorClass, "title" | "description" | "prerequisites_description" | "max_capacity" | "status">> & { enrollment_policy?: EnrollmentPolicy },
) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return updateDemoTutorClass(classId, payload);
  const response = await lmsClient.patch<TutorClass>(`/classes/${classId}`, payload);
  return response.data;
}

export async function getTutorClassMembers(
  classId: string,
  query: { status?: "PENDING" | "ACTIVE"; page?: number; size?: number } = {},
  signal?: AbortSignal,
) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return getDemoTutorClassMembers(classId, query);
  const response = await lmsClient.get<TutorMemberPage>(
    `/classes/${classId}/members`,
    { params: query, signal },
  );
  return response.data;
}

export async function approveTutorMember(classId: string, memberId: string) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return updateDemoTutorMember(classId, memberId, "approve");
  await lmsClient.post(`/classes/${classId}/members/${memberId}/approve`);
}

export async function rejectTutorMember(classId: string, memberId: string) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return updateDemoTutorMember(classId, memberId, "reject");
  await lmsClient.post(`/classes/${classId}/members/${memberId}/reject`);
}

export async function removeTutorMember(classId: string, memberId: string) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return updateDemoTutorMember(classId, memberId, "remove");
  await lmsClient.delete(`/classes/${classId}/members/${memberId}`);
}

export async function getTutorOutline(classId: string, signal?: AbortSignal) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return getDemoTutorOutline(classId);
  const response = await lmsClient.get<TutorOutline>(`/classes/${classId}/outline`, { signal });
  return response.data;
}

export async function createChapter(classId: string, payload: {
  title: string; description?: string; sequence_order: number; status: ContentVisibility;
}) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return saveDemoChapter(classId, undefined, payload);
  const response = await lmsClient.post(`/classes/${classId}/chapters`, payload);
  return response.data;
}

export async function updateChapter(chapterId: string, payload: Partial<{
  title: string; description: string | null; sequence_order: number; status: ContentVisibility;
}>) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return saveDemoChapter("", chapterId, payload as { title: string; description?: string | null; sequence_order: number; status: ContentVisibility });
  const response = await lmsClient.patch(`/chapters/${chapterId}`, payload);
  return response.data;
}

export async function deleteChapter(chapterId: string) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return removeDemoChapter(chapterId);
  await lmsClient.delete(`/chapters/${chapterId}`);
}

export async function createLesson(chapterId: string, payload: {
  title: string; description?: string; estimated_duration?: number | null;
  sequence_order: number; status: ContentVisibility;
}) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return saveDemoLesson(chapterId, undefined, payload);
  const response = await lmsClient.post(`/chapters/${chapterId}/lessons`, payload);
  return response.data;
}

export async function updateLesson(lessonId: string, payload: Partial<{
  title: string; description: string | null; estimated_duration: number | null;
  sequence_order: number; status: ContentVisibility;
}>) {
  if (import.meta.env.VITE_DEMO_MODE === "true") {
    const { chapter_id: chapterId } = findDemoLessonParent(lessonId);
    return saveDemoLesson(chapterId, lessonId, payload as { title: string; description?: string | null; estimated_duration?: number | null; sequence_order: number; status: ContentVisibility });
  }
  const response = await lmsClient.patch(`/lessons/${lessonId}`, payload);
  return response.data;
}

export async function deleteLesson(lessonId: string) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return removeDemoLesson(lessonId);
  await lmsClient.delete(`/lessons/${lessonId}`);
}

export async function createMaterial(lessonId: string, payload: {
  title: string; material_type: MaterialKind; file_url?: string | null; content?: string | null;
  sequence_order: number; status: ContentVisibility;
}) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return saveDemoMaterial(lessonId, undefined, payload);
  const response = await lmsClient.post(`/lessons/${lessonId}/materials`, payload);
  return response.data;
}

export async function updateMaterial(materialId: string, payload: Partial<{
  title: string; content: string | null; file_url: string | null;
  sequence_order: number; status: ContentVisibility;
}>) {
  if (import.meta.env.VITE_DEMO_MODE === "true") {
    const { lesson_id: lessonId, material_type: materialType } = findDemoMaterialParent(materialId);
    return saveDemoMaterial(lessonId, materialId, { ...payload, material_type: materialType } as { title: string; material_type: MaterialKind; file_url?: string | null; content?: string | null; sequence_order: number; status: ContentVisibility });
  }
  const response = await lmsClient.patch(`/materials/${materialId}`, payload);
  return response.data;
}

export async function deleteMaterial(materialId: string) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return removeDemoMaterial(materialId);
  await lmsClient.delete(`/materials/${materialId}`);
}

export async function reorderChapters(classId: string, chapterIds: string[]) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return reorderDemoChapters(classId, chapterIds);
  await lmsClient.put(`/classes/${classId}/chapter-order`, { chapter_ids: chapterIds });
}

export async function reorderLessons(chapterId: string, lessonIds: string[]) {
  if (import.meta.env.VITE_DEMO_MODE === "true") return reorderDemoLessons(chapterId, lessonIds);
  await lmsClient.put(`/chapters/${chapterId}/lesson-order`, { lesson_ids: lessonIds });
}

function findDemoLessonParent(lessonId: string) {
  for (const classId of ["class-001", "class-002", "class-003", "class-004", "class-005", "class-006"]) {
    const outline = getDemoTutorOutline(classId);
    const chapter = outline.chapters.find((item) => item.lessons.some((lesson) => lesson.lesson_id === lessonId));
    if (chapter) return { chapter_id: chapter.chapter_id };
  }
  throw new Error("Demo lesson not found.");
}

function findDemoMaterialParent(materialId: string) {
  for (const classId of ["class-001", "class-002", "class-003", "class-004", "class-005", "class-006"]) {
    const outline = getDemoTutorOutline(classId);
    for (const chapter of outline.chapters) {
      for (const lesson of chapter.lessons) {
        const material = lesson.materials.find((item) => item.material_id === materialId);
        if (material) return { lesson_id: lesson.lesson_id, material_type: material.material_type };
      }
    }
  }
  throw new Error("Demo material not found.");
}
