import { lmsClient } from "../../../api/lmsClient";
import type { EnrollmentPolicy } from "../../classes/types";
import type {
  CreateTutorClass,
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
  // Reserved for LMS-3 F02. The current members endpoint ignores q, and the UI does not send it.
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
