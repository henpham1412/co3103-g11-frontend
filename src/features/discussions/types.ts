// Wire shapes of DOC-05 sections 3.3 and 3.5, as returned by the LMS-10/LMS-11 endpoints.
export interface DiscussionPost {
  discussion_id: string;
  class_id: string;
  lesson_id: string | null;
  author_id: string;
  parent_id: string | null;
  title: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface DiscussionPage {
  items: DiscussionPost[];
  page: number;
  size: number;
  total_items: number;
  total_pages: number;
}

export interface CreateDiscussionInput {
  title: string;
  content: string;
  lesson_id?: string;
}

export interface CreateReplyInput {
  title?: string;
  content: string;
}

export interface UpdateDiscussionInput {
  title?: string;
  content?: string;
}

export type ReportableContentType = "DISCUSSION" | "MATERIAL";
export type ContentReportReason = "SPAM" | "HARASSMENT" | "INAPPROPRIATE" | "OTHER";
export type ContentReportStatus = "PENDING" | "REVIEWED" | "RESOLVED" | "DISMISSED";

export interface CreateContentReportInput {
  content_type: ReportableContentType;
  content_id: string;
  reason: ContentReportReason;
  description?: string;
}

export interface ContentReportResponse {
  report_id: string;
  content_type: ReportableContentType;
  content_id: string;
  reason: ContentReportReason;
  status: ContentReportStatus;
  created_at: string;
}