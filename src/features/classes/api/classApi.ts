import { lmsClient } from "../../../api/lmsClient";
import type {
  ClassCatalogItem,
  ClassCatalogResponse,
  ClassOutlineLesson,
  ClassOutlineMaterial,
  ClassOutlineResponse,
  CurrentMembership,
  CurrentMembershipPage,
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
  const memberships: CurrentMembership[] = [];
  const classIds = new Set<string>();
  let totalItems: number | undefined;
  let page = 1;
  const size = 20;

  // A class absent from this list is treated as non-enrolled by both screens.
  // Publish the list only after every page has been read and validated; a failed
  // or incomplete response must never enable Join for an existing membership.
  for (;;) {
    const response = await lmsClient.get<unknown>("/me/classes", {
      params: { page, size },
      signal,
    });
    const data = response.data;
    if (!isMembershipPage(data)
      || data.page !== page
      || data.size !== size
      || data.total_pages !== Math.ceil(data.total_items / size)
      || data.items.length !== Math.min(size, Math.max(0, data.total_items - (page - 1) * size))
      || (totalItems !== undefined && data.total_items !== totalItems)) {
      throw new Error("Membership status is unavailable: invalid or changed pagination response.");
    }
    totalItems = data.total_items;
    for (const item of data.items) {
      if (classIds.has(item.class_id)) {
        throw new Error("Membership status is unavailable: duplicate class across pages.");
      }
      classIds.add(item.class_id);
      memberships.push({ class_id: item.class_id, status: item.membership_status });
    }
    if (page >= data.total_pages) return memberships;
    page += 1;
  }
}

function isMembershipPage(data: unknown): data is CurrentMembershipPage {
  if (typeof data !== "object" || data === null) return false;
  const value = data as Record<string, unknown>;
  return Number.isSafeInteger(value.page) && (value.page as number) >= 1
    && Number.isSafeInteger(value.size) && (value.size as number) >= 1
    && Number.isSafeInteger(value.total_items) && (value.total_items as number) >= 0
    && Number.isSafeInteger(value.total_pages) && (value.total_pages as number) >= 0
    && Array.isArray(value.items)
    && value.items.every((item: unknown) => {
      if (typeof item !== "object" || item === null) return false;
      const membership = item as Record<string, unknown>;
      return typeof membership.class_id === "string" && membership.class_id.trim().length > 0
        && (membership.membership_status === "ACTIVE" || membership.membership_status === "PENDING");
    });
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
