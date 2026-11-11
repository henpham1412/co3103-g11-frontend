import { lmsClient } from "../../../api/lmsClient";
import type { EnrollmentPolicy } from "../../classes/types";
import type {
  CreateTutorClass,
  MaterialKind,
  TutorChapter,
  TutorLesson,
  TutorMaterial,
  TutorOutline,
  TutorClass,
  TutorClassPage,
  TutorMemberPage,
} from "../types";

export async function getTutorClasses(
  query: { page?: number; size?: number; sort?: string } = {},
  signal?: AbortSignal,
) {
  const response = await lmsClient.get<TutorClassPage>("/tutor/classes", {
    params: query,
    signal,
  });
  return response.data;
}

export async function createTutorClass(payload: CreateTutorClass) {
  const response = await lmsClient.post<TutorClass>("/classes", payload);
  return response.data;
}

export async function updateTutorClass(
  classId: string,
  payload: Partial<Pick<TutorClass, "title" | "description" | "prerequisites_description" | "max_capacity" | "status">> & { enrollment_policy?: EnrollmentPolicy },
) {
  const response = await lmsClient.patch<TutorClass>(`/classes/${classId}`, payload);
  return response.data;
}

export interface TutorMemberQuery {
  status?: "PENDING" | "ACTIVE";
  // The server searches the local user's full name and email.
  q?: string;
  page?: number;
  size?: number;
  sort?: string;
}

export async function getTutorClassMembers(
  classId: string,
  query: TutorMemberQuery = {},
  signal?: AbortSignal,
) {
  const response = await lmsClient.get<TutorMemberPage>(
    `/classes/${classId}/members`,
    { params: query, signal },
  );
  return response.data;
}

export async function approveTutorMember(classId: string, memberId: string) {
  await lmsClient.post(`/classes/${classId}/members/${memberId}/approve`);
}

export async function rejectTutorMember(classId: string, memberId: string) {
  await lmsClient.post(`/classes/${classId}/members/${memberId}/reject`);
}

export async function removeTutorMember(classId: string, memberId: string) {
  await lmsClient.delete(`/classes/${classId}/members/${memberId}`);
}

export async function getTutorOutline(classId: string, signal?: AbortSignal) {
  const response = await lmsClient.get<TutorOutline>(`/classes/${classId}/outline`, { signal });
  return response.data;
}

export type ChapterWrite = Partial<Pick<TutorChapter, "title" | "description" | "sequence_order" | "status">>;
export type LessonWrite = ChapterWrite & Partial<Pick<TutorLesson, "estimated_duration">>;
export type MaterialWrite = Partial<Pick<TutorMaterial, "title" | "content" | "file_url" | "sequence_order" | "status">>;

// Mirrors LocalMaterialStorageService: the media type is checked against the bytes, and the
// size ceiling differs per material type, so the form cannot promise an upload the server refuses.
export const MATERIAL_UPLOAD_EXTENSIONS = {
  DOCUMENT: [".pdf", ".docx", ".pptx"],
  VIDEO: [".mp4", ".webm"],
} as const;

export function materialExtensionAllowed(kind: "DOCUMENT" | "VIDEO", fileName: string) {
  const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  return (MATERIAL_UPLOAD_EXTENSIONS[kind] as readonly string[]).includes(extension);
}

export const MATERIAL_UPLOAD_LIMITS: Record<"DOCUMENT" | "VIDEO", { accept: string; maxBytes: number; label: string }> = {
  DOCUMENT: {
    accept: ".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation",
    maxBytes: 50 * 1024 * 1024,
    label: "PDF, DOCX or PPTX up to 50 MB",
  },
  VIDEO: { accept: ".mp4,.webm,video/mp4,video/webm", maxBytes: 200 * 1024 * 1024, label: "MP4 or WebM up to 200 MB" },
};

// Content writes answer with the single item, but every caller reloads the outline to get the
// parent's children back, so the responses are deliberately not part of the surface.
export async function createChapter(classId: string, payload: ChapterWrite): Promise<void> {
  await lmsClient.post(`/classes/${classId}/chapters`, payload);
}

export async function updateChapter(chapterId: string, payload: ChapterWrite): Promise<void> {
  await lmsClient.patch(`/chapters/${chapterId}`, payload);
}

export async function deleteChapter(chapterId: string) {
  await lmsClient.delete(`/chapters/${chapterId}`);
}

export async function createLesson(chapterId: string, payload: LessonWrite): Promise<void> {
  await lmsClient.post(`/chapters/${chapterId}/lessons`, payload);
}

export async function updateLesson(lessonId: string, payload: LessonWrite): Promise<void> {
  await lmsClient.patch(`/lessons/${lessonId}`, payload);
}

export async function deleteLesson(lessonId: string) {
  await lmsClient.delete(`/lessons/${lessonId}`);
}

export async function createMaterial(lessonId: string, payload: MaterialWrite & { title: string; material_type: MaterialKind }): Promise<void> {
  await lmsClient.post(`/lessons/${lessonId}/materials`, payload);
}

// DOCUMENT and VIDEO materials have no JSON path: the bytes travel with a metadata part,
// and the server rejects any file_url or content sent alongside them.
export async function uploadMaterial(lessonId: string, metadata: MaterialWrite & { title: string; material_type: "DOCUMENT" | "VIDEO" }, file: File): Promise<void> {
  const body = new FormData();
  body.append("metadata", new Blob([JSON.stringify({ ...metadata, file_url: null, content: null })], { type: "application/json" }));
  body.append("file", file);
  await lmsClient.post(`/lessons/${lessonId}/materials`, body);
}

export async function updateMaterial(materialId: string, payload: MaterialWrite): Promise<void> {
  await lmsClient.patch(`/materials/${materialId}`, payload);
}

export async function deleteMaterial(materialId: string) {
  await lmsClient.delete(`/materials/${materialId}`);
}

export async function reorderChapters(classId: string, chapterIds: string[]) {
  await lmsClient.put(`/classes/${classId}/chapter-order`, { chapter_ids: chapterIds });
}

export async function reorderLessons(chapterId: string, lessonIds: string[]) {
  await lmsClient.put(`/chapters/${chapterId}/lesson-order`, { lesson_ids: lessonIds });
}

// Materials have no order endpoint, so a swap writes the two exchanged positions directly.
export async function swapMaterialOrder(first: TutorMaterial, second: TutorMaterial) {
  await Promise.all([
    updateMaterial(first.material_id, { sequence_order: second.sequence_order }),
    updateMaterial(second.material_id, { sequence_order: first.sequence_order }),
  ]);
}

// The thumbnail is a separate multipart write, so the JSON class-settings PATCH never
// has to guess which fields the server accepts.
export async function uploadClassThumbnail(classId: string, file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const response = await lmsClient.post<{ thumbnail_url: string }>(
    `/classes/${classId}/thumbnail`,
    body,
  );
  return response.data.thumbnail_url;
}
