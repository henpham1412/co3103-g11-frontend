import { lmsClient } from "../../../api/lmsClient";
import type { AssignmentSubmission } from "../../classes/api/assignmentApi";

export interface TutorAssignmentDetails {
  assignment_id: string;
  activity_id: string;
  title?: string;
  description?: string | null;
  status?: "PUBLISHED" | "HIDDEN";
  sequence_order?: number;
  opening_time: string | null;
  deadline: string;
  allow_late: boolean;
  allowed_file_types: string[] | null;
  max_file_size_mb: number | null;
  attachments: TutorAssignmentAttachment[];
}

export interface TutorAssignmentAttachment {
  attachment_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

export interface SubmissionListItem {
  submission_id: string;
  class_member_id: string;
  student_id: string;
  student_name?: string | null;
  file_name: string;
  submitted_at: string;
  is_late: boolean;
  status: "SUBMITTED" | "GRADED";
  score: number | null;
}

export interface SubmissionListResponse {
  items: SubmissionListItem[];
  page: number;
  size: number;
  total_items: number;
  total_pages: number;
}

export async function getTutorAssignment(activityId: string, signal?: AbortSignal) {
  const response = await lmsClient.get<TutorAssignmentDetails>(
    `/activities/${activityId}/assignment`,
    { signal },
  );
  return response.data;
}

export async function createTutorAssignment(
  lessonId: string,
  payload: {
    title: string;
    description?: string;
    sequence_order: number;
    status: "PUBLISHED" | "HIDDEN";
    assignment: {
      opening_time: string | null;
      deadline: string;
      allow_late: boolean;
      allowed_file_types: string[] | null;
      max_file_size_mb: number | null;
    };
  },
) {
  const response = await lmsClient.post<TutorAssignmentDetails>(
    `/lessons/${lessonId}/activities`,
    { activity_type: "ASSIGNMENT", ...payload },
  );
  return response.data;
}

export async function updateTutorAssignmentActivity(
  activityId: string,
  payload: { title?: string; description?: string; sequence_order?: number; status?: "PUBLISHED" | "HIDDEN" },
) {
  await lmsClient.patch(`/activities/${activityId}`, payload);
}

export async function updateTutorAssignmentSettings(
  activityId: string,
  payload: {
    opening_time?: string | null;
    deadline?: string;
    allow_late?: boolean;
    allowed_file_types?: string[] | null;
    max_file_size_mb?: number | null;
  },
) {
  await lmsClient.patch(`/activities/${activityId}/assignment`, payload);
}

export async function uploadAssignmentAttachment(assignmentId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const response = await lmsClient.post<TutorAssignmentAttachment>(
    `/assignments/${assignmentId}/attachments`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response.data;
}

export async function deleteAssignmentAttachment(attachmentId: string) {
  await lmsClient.delete(`/assignment-attachments/${attachmentId}`);
}

export async function listSubmissions(
  assignmentId: string,
  params: { page?: number; size?: number; status?: "SUBMITTED" | "GRADED" } = {},
  signal?: AbortSignal,
) {
  const response = await lmsClient.get<SubmissionListResponse>(
    `/assignments/${assignmentId}/submissions`,
    { params, signal },
  );
  return response.data;
}

export async function getSubmission(submissionId: string, signal?: AbortSignal) {
  const response = await lmsClient.get<AssignmentSubmission>(
    `/submissions/${submissionId}`,
    { signal },
  );
  return response.data;
}

export async function gradeSubmission(
  submissionId: string,
  payload: { score: number; feedback?: string; version: number },
) {
  const response = await lmsClient.patch<AssignmentSubmission>(
    `/submissions/${submissionId}/grade`,
    payload,
  );
  return response.data;
}

/**
 * Downloads a student submission file via the authenticated LMS client.
 */
export async function downloadSubmission(
  submissionId: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string }> {
  const response = await lmsClient.get<Blob>(
    `/submissions/${submissionId}/download`,
    { responseType: "blob", signal },
  );
  const disposition = response.headers["content-disposition"] as string | undefined;
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : (quoted ?? "submission");
  return { blob: response.data, filename };
}
