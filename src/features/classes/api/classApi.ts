import { lmsClient } from "../../../api/lmsClient";
import type {
  ClassCatalogItem,
  ClassCatalogResponse,
  ClassOutlineResponse,
  CurrentMembership,
  EnrollmentPolicy,
  MembershipActionResponse,
} from "../types";

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
  const response = await lmsClient.get<ClassCatalogResponse>("/classes", {
    params: query,
    signal,
  });
  return response.data;
}

export async function getCurrentMemberships(
  signal?: AbortSignal,
): Promise<CurrentMembership[]> {
  const response = await lmsClient.get<CurrentMembership[]>("/me/classes", {
    signal,
  });
  return response.data;
}

export async function joinClass(
  classId: string,
  policy: EnrollmentPolicy,
): Promise<MembershipActionResponse> {
  const endpoint =
    policy === "OPEN"
      ? `/classes/${classId}/membership`
      : `/classes/${classId}/join-requests`;
  const response = await lmsClient.post<MembershipActionResponse>(endpoint);
  return response.data;
}

export async function leaveClass(classId: string): Promise<void> {
  await lmsClient.delete(`/classes/${classId}/membership`);
}

export async function withdrawJoinRequest(classId: string): Promise<void> {
  await lmsClient.delete(`/classes/${classId}/membership-request`);
}

export async function getClassDetails(
  classId: string,
  signal?: AbortSignal,
): Promise<ClassCatalogItem> {
  const response = await lmsClient.get<ClassCatalogItem>(`/classes/${classId}`, {
    signal,
  });
  return response.data;
}

export async function getClassOutline(
  classId: string,
  signal?: AbortSignal,
): Promise<ClassOutlineResponse> {
  const response = await lmsClient.get<ClassOutlineResponse>(
    `/classes/${classId}/outline`,
    { signal },
  );
  return response.data;
}
