import { lmsClient } from "../../../api/lmsClient";

export interface AssignmentAttachment {
  attachment_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

export interface AssignmentConfiguration {
  assignment_id: string;
  activity_id: string;
  opening_time: string | null;
  deadline: string;
  allow_late: boolean;
  allowed_file_types: string[] | null;
  max_file_size_mb: number | null;
  attachments: AssignmentAttachment[];
}

export interface AssignmentSubmission {
  submission_id: string;
  assignment_id: string;
  class_member_id: string;
  student_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  submitted_at: string;
  is_late: boolean;
  status: "SUBMITTED" | "GRADED";
  score: number | null;
  feedback: string | null;
  graded_by: string | null;
  graded_at: string | null;
  version: number;
}

export async function getAssignmentConfig(activityId: string, signal?: AbortSignal) {
  const response = await lmsClient.get<AssignmentConfiguration>(
    `/activities/${activityId}/assignment`,
    { signal },
  );
  return response.data;
}

export async function getMySubmission(assignmentId: string, signal?: AbortSignal) {
  const response = await lmsClient.get<AssignmentSubmission>(
    `/assignments/${assignmentId}/submissions/me`,
    { signal },
  );
  return response.data;
}

export async function submitAssignmentFile(
  assignmentId: string,
  file: File,
): Promise<AssignmentSubmission> {
  const form = new FormData();
  form.append("file", file);
  const response = await lmsClient.put<AssignmentSubmission>(
    `/assignments/${assignmentId}/submission`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response.data;
}

/**
 * Downloads a reference attachment via the authenticated LMS client.
 * Returns a Blob and the server-supplied filename (from Content-Disposition).
 */
export async function downloadAssignmentAttachment(
  attachmentId: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string }> {
  const response = await lmsClient.get<Blob>(
    `/assignment-attachments/${attachmentId}/download`,
    { responseType: "blob", signal },
  );
  const disposition = response.headers["content-disposition"] as string | undefined;
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : (quoted ?? "attachment");
  return { blob: response.data, filename };
}

/** Triggers a browser Save-As dialog from a Blob. */
export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
