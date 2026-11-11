import { lmsClient } from "../../../api/lmsClient";
import type {
  ClassCatalogItem,
  ClassCatalogResponse,
  ClassOutlineLesson,
  ClassOutlineMaterial,
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

export async function getStudentLesson(
  lessonId: string,
  signal?: AbortSignal,
): Promise<ClassOutlineLesson> {
  const response = await lmsClient.get<ClassOutlineLesson>(`/lessons/${lessonId}`, { signal });
  return response.data;
}

export async function getStudentLessonMaterials(
  lessonId: string,
  signal?: AbortSignal,
): Promise<ClassOutlineMaterial[]> {
  const response = await lmsClient.get<ClassOutlineMaterial[]>(
    `/lessons/${lessonId}/materials`,
    { signal },
  );
  return response.data;
}

// Material files are served only from the API origin, so the relative download URL is
// resolved against the configured base and rejected before it can leave it.
export async function downloadStudentMaterial(
  fileUrl: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename?: string }> {
  const baseUrl = lmsClient.defaults.baseURL ?? "";
  const base = new URL(baseUrl, window.location.href);
  const file = new URL(fileUrl, base);
  if (file.origin !== base.origin) {
    throw new Error("This file URL is outside the LMS API origin.");
  }
  const basePath = base.pathname.replace(/\/$/, "");
  const apiPath = file.pathname.startsWith(`${basePath}/`)
    ? file.pathname.slice(basePath.length)
    : file.pathname;
  if (!apiPath.startsWith("/materials/files/")) {
    throw new Error("This file URL is outside the LMS material download endpoint.");
  }
  const response = await lmsClient.get<Blob>(apiPath, { responseType: "blob", signal });
  const disposition = response.headers["content-disposition"] as string | undefined;
  const encodedName = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quotedName = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  const filename = encodedName ? decodeURIComponent(encodedName) : quotedName;
  return { blob: response.data, filename };
}
