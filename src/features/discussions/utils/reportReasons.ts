import type { ContentReportReason } from "../types";

// The four reasons of DOC-05 section 3.5, in the order the report form offers them.
export const REPORT_REASONS: { value: ContentReportReason; label: string }[] = [
  { value: "SPAM", label: "Spam or advertising" },
  { value: "HARASSMENT", label: "Harassment or bullying" },
  { value: "INAPPROPRIATE", label: "Inappropriate content" },
  { value: "OTHER", label: "Other" },
];

export const REPORT_SUBMITTED_MESSAGE = "Thank you. Your report has been submitted.";