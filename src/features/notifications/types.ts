export type NotificationType =
  | "ENROLLMENT_UPDATE"
  | "CONTENT_RELEASED"
  | "ASSESSMENT_RESULT"
  | "ASSIGNMENT_SUBMISSION"
  | "DISCUSSION_REPLY"
  | "DEADLINE_REMINDER"
  | (string & {});

export interface NotificationItem {
  notification_id: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  target_url: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

export interface NotificationPage {
  items: NotificationItem[];
  page: number;
  size: number;
  total_items: number;
  total_pages: number;
}

export type NotificationFilter = "all" | "unread" | "read";

export interface NotificationListQuery {
  is_read?: boolean;
  page?: number;
  size?: number;
}
