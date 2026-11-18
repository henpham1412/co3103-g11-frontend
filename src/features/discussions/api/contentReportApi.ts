import { lmsClient } from "../../../api/lmsClient";
import type { ContentReportResponse, CreateContentReportInput } from "../types";

export async function createContentReport(
  input: CreateContentReportInput,
): Promise<ContentReportResponse> {
  // The server rejects a blank description, so an empty optional field is omitted rather than sent.
  const description = input.description?.trim();
  const response = await lmsClient.post<ContentReportResponse>("/content-reports", {
    content_type: input.content_type,
    content_id: input.content_id,
    reason: input.reason,
    ...(description ? { description } : {}),
  });
  return response.data;
}