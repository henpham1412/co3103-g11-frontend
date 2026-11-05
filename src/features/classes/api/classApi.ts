import { lmsClient } from "../../../api/lmsClient";
import type {
  ClassCatalogItem,
  ClassCatalogResponse,
  ClassOutlineResponse,
  CurrentMembership,
  EnrollmentPolicy,
  MembershipActionResponse,
} from "../types";
import { endDemoMembership, getDemoCatalog, getDemoClass, getDemoMemberships, getDemoOutline, joinDemoClass } from "./demoClassApi";

export interface ClassCatalogQuery {
  q?: string;
  enrollment_policy?: EnrollmentPolicy;
  page?: number;
  size?: number;
  sort?: string;
}

export async function getClassCatalog(
  query: ClassCatalogQuery = {},
  signal?: AbortSignal,
): Promise<ClassCatalogResponse> {
  if (import.meta.env.VITE_DEMO_MODE === "true") return getDemoCatalog(query);
  const response = await lmsClient.get<ClassCatalogResponse>("/classes", {
    params: query,
    signal,
  });
  return response.data;
}

export async function getCurrentMemberships(
  signal?: AbortSignal,
): Promise<CurrentMembership[]> {
  if (import.meta.env.VITE_DEMO_MODE === "true") return getDemoMemberships();
  const response = await lmsClient.get<CurrentMembership[]>("/me/classes", {
    signal,
  });
  return response.data;
}

export async function joinClass(
  classId: string,
  policy: EnrollmentPolicy,
): Promise<MembershipActionResponse> {
  if (import.meta.env.VITE_DEMO_MODE === "true") return joinDemoClass(classId, policy);
  const endpoint =
    policy === "OPEN"
      ? `/classes/${classId}/membership`
      : `/classes/${classId}/join-requests`;
  const response = await lmsClient.post<MembershipActionResponse>(endpoint);
  return response.data;
}

export async function leaveClass(classId: string): Promise<void> {
  if (import.meta.env.VITE_DEMO_MODE === "true") return endDemoMembership(classId);
  await lmsClient.delete(`/classes/${classId}/membership`);
}

export async function withdrawJoinRequest(classId: string): Promise<void> {
  if (import.meta.env.VITE_DEMO_MODE === "true") return endDemoMembership(classId);
  await lmsClient.delete(`/classes/${classId}/membership-request`);
}

export async function getClassDetails(
  classId: string,
  signal?: AbortSignal,
): Promise<ClassCatalogItem> {
  if (import.meta.env.VITE_DEMO_MODE === "true") return getDemoClass(classId);
  const response = await lmsClient.get<ClassCatalogItem>(`/classes/${classId}`, {
    signal,
  });
  return response.data;
}

export async function getClassOutline(
  classId: string,
  signal?: AbortSignal,
): Promise<ClassOutlineResponse> {
  if (import.meta.env.VITE_DEMO_MODE === "true") return getDemoOutline(classId);
  const response = await lmsClient.get<ClassOutlineResponse>(
    `/classes/${classId}/outline`,
    { signal },
  );
  return response.data;
}
