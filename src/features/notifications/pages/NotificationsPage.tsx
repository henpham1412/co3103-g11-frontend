import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Empty, Pagination, Segmented, Spin, Tag } from "antd";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";

import StudentWorkspaceLayout from "@/components/layout/StudentWorkspaceLayout";
import TutorWorkspaceLayout from "@/components/layout/TutorWorkspaceLayout";

import { listNotifications, markNotificationRead } from "../api/notificationApi";
import type { NotificationFilter, NotificationItem, NotificationPage, NotificationType } from "../types";
import { notificationErrorMessage } from "../utils/notificationErrorText";
import { resolveNotificationTarget } from "../utils/notificationTarget";
import "../notifications.css";

const PAGE_SIZE = 20;

const TYPE_META: Record<string, { label: string; color: string }> = {
  ENROLLMENT_UPDATE: { label: "Enrollment", color: "blue" },
  CONTENT_RELEASED: { label: "New content", color: "cyan" },
  ASSESSMENT_RESULT: { label: "Assessment result", color: "green" },
  ASSIGNMENT_SUBMISSION: { label: "Assignment submission", color: "purple" },
  DISCUSSION_REPLY: { label: "Discussion", color: "geekblue" },
  DEADLINE_REMINDER: { label: "Deadline reminder", color: "orange" },
};

function typeBadge(type: NotificationType): { label: string; color: string } {
  return TYPE_META[type] ?? { label: type.replace(/_/g, " "), color: "default" };
}

function formatTimestamp(iso: string): string {
  const parsed = dayjs(iso);
  return parsed.isValid() ? parsed.format("MMM D, YYYY HH:mm") : iso;
}

export interface NotificationsPageProps {
  variant: "student" | "tutor";
  isRouteAvailable?: (path: string) => boolean;
}

export default function NotificationsPage({ variant, isRouteAvailable }: NotificationsPageProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [page, setPage] = useState(1);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [data, setData] = useState<NotificationPage | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [markingIds, setMarkingIds] = useState<Set<string>>(() => new Set());

  const requestKey = `${filter}:${page}:${reloadNonce}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();

    const query = {
      page,
      size: PAGE_SIZE,
      ...(filter === "all" ? {} : { is_read: filter === "read" }),
    };

    listNotifications(query, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError(null);
          setLoadedKey(requestKey);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(notificationErrorMessage(err));
          setLoadedKey(requestKey);
        }
      });

    return () => {
      controller.abort();
    };
  }, [filter, page, reloadNonce, requestKey]);

  const handleMarkRead = useCallback(
    async (item: NotificationItem): Promise<boolean> => {
      if (item.is_read || markingIds.has(item.notification_id)) {
        return true;
      }
      setActionError(null);
      setMarkingIds((prev) => new Set(prev).add(item.notification_id));
      try {
        const updated = await markNotificationRead(item.notification_id);
        setData((prev) => {
          if (!prev) return prev;
          if (filter === "unread") {
            const remaining = prev.items.filter((entry) => entry.notification_id !== item.notification_id);
            const nextTotal = Math.max(0, prev.total_items - 1);
            return {
              ...prev,
              items: remaining,
              total_items: nextTotal,
              total_pages: Math.ceil(nextTotal / prev.size),
            };
          }
          return {
            ...prev,
            items: prev.items.map((entry) =>
              entry.notification_id === item.notification_id ? updated : entry,
            ),
          };
        });
        return true;
      } catch (err: unknown) {
        setActionError(notificationErrorMessage(err, "Could not update notification status. Please try again."));
        return false;
      } finally {
        setMarkingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.notification_id);
          return next;
        });
      }
    },
    [filter, markingIds],
  );

  const handleOpenResource = useCallback(
    async (item: NotificationItem, href: string) => {
      if (!item.is_read) {
        const ok = await handleMarkRead(item);
        if (!ok) return;
      }
      void navigate(href);
    },
    [handleMarkRead, navigate],
  );

  const items = data?.items ?? [];
  const totalItems = data?.total_items ?? 0;
  const emptyDescription =
    filter === "unread"
      ? "You have no unread notifications."
      : filter === "read"
        ? "You have no read notifications."
        : "You have no notifications yet.";

  const content = (
    <div className="notifications-page">
      <div className="notifications-page__header">
        <div>
          <h1 className="notifications-page__title">Notifications</h1>
          <p className="notifications-page__subtitle">
            {loading && !data
              ? "Loading your notification inbox…"
              : filter === "unread"
                ? `${totalItems} unread notification${totalItems === 1 ? "" : "s"}`
                : `${totalItems} notification${totalItems === 1 ? "" : "s"} in the last 90 days`}
          </p>
        </div>
        <div className="notifications-page__controls">
          <Segmented<NotificationFilter>
            aria-label="Filter notifications"
            value={filter}
            options={[
              { label: "All", value: "all" },
              { label: "Unread", value: "unread" },
              { label: "Read", value: "read" },
            ]}
            onChange={(nextFilter) => {
              setFilter(nextFilter);
              setPage(1);
              setActionError(null);
            }}
          />
          <Button onClick={() => setReloadNonce((n) => n + 1)} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {actionError && (
        <Alert
          type="error"
          showIcon
          closable
          onClose={() => setActionError(null)}
          title="Action failed"
          description={actionError}
        />
      )}

      {loading ? (
        <div className="notifications-page__loading" role="status" aria-label="Loading notifications">
          <Spin size="large" />
        </div>
      ) : error ? (
        <Alert
          type="error"
          showIcon
          title="Unable to load notifications"
          description={error}
          action={
            <Button size="small" onClick={() => setReloadNonce((n) => n + 1)}>
              Retry
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <Empty description={emptyDescription} />
      ) : (
        <>
          <ul className="notifications-page__list" aria-label="Notification list">
            {items.map((item) => {
              const badge = typeBadge(item.notification_type);
              const resolvedTarget = resolveNotificationTarget(item.target_url, isRouteAvailable);
              const isMarking = markingIds.has(item.notification_id);

              return (
                <li
                  key={item.notification_id}
                  className={`notifications-page__item${item.is_read ? "" : " notifications-page__item--unread"}`}
                >
                  <div className="notifications-page__item-row">
                    <div className="notifications-page__item-body">
                      <div className="notifications-page__item-meta">
                        {!item.is_read && <Badge status="processing" text="Unread" />}
                        <Tag color={badge.color}>{badge.label}</Tag>
                        <time className="notifications-page__item-time" dateTime={item.created_at}>
                          {formatTimestamp(item.created_at)}
                        </time>
                      </div>
                      <h2 className="notifications-page__item-title">{item.title}</h2>
                      <p className="notifications-page__item-message">{item.message}</p>
                      {resolvedTarget?.isFallback && resolvedTarget.fallbackNotice && (
                        <p className="notifications-page__fallback-note" role="note">
                          {resolvedTarget.fallbackNotice}
                        </p>
                      )}
                    </div>
                    <div className="notifications-page__item-actions">
                      {!item.is_read && (
                        <Button
                          size="small"
                          loading={isMarking}
                          disabled={isMarking}
                          onClick={() => void handleMarkRead(item)}
                        >
                          Mark as read
                        </Button>
                      )}
                      {resolvedTarget && (
                        <Button
                          type={item.is_read ? "default" : "primary"}
                          size="small"
                          disabled={isMarking}
                          onClick={() => void handleOpenResource(item, resolvedTarget.href)}
                        >
                          {resolvedTarget.isFallback ? "Open class content" : "Open resource"}
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {totalItems > PAGE_SIZE && (
            <div className="notifications-page__pagination">
              <Pagination
                current={page}
                pageSize={PAGE_SIZE}
                total={totalItems}
                showSizeChanger={false}
                onChange={(nextPage) => setPage(nextPage)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );

  if (variant === "tutor") {
    return <TutorWorkspaceLayout currentPage="Notifications">{content}</TutorWorkspaceLayout>;
  }
  return <StudentWorkspaceLayout currentPage="Notifications">{content}</StudentWorkspaceLayout>;
}
