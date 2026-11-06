import { lmsClient } from "../../../api/lmsClient";
import type { EnrollmentPolicy } from "../../classes/types";
import type {
  CreateTutorClass,
  TutorClass,
  TutorClassPage,
  TutorMemberPage,
} from "../types";
import {
  createDemoTutorClass,
  getDemoTutorClasses,
  getDemoTutorClassMembers,
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
