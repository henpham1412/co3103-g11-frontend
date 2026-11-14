import { useEffect, useState } from "react";
import { Alert, Button, Card, Empty, Spin, Tag, Typography } from "antd";
import { Link } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import StudentWorkspaceLayout from "../../../components/layout/StudentWorkspaceLayout";
import TutorWorkspaceLayout from "../../../components/layout/TutorWorkspaceLayout";
import { getClassDetails, getCurrentMemberships } from "../../classes/api/classApi";
import type { ClassCatalogItem } from "../../classes/types";
import { getTutorClasses } from "../../tutor-classes/api/tutorClassApi";
import type { TutorClass } from "../../tutor-classes/types";
import { discussionErrorText } from "../utils/discussionErrorText";
import "../discussions.css";

export type DiscussionVariant = "student" | "tutor";

interface HubClass {
  class_id: string;
  title: string;
  class_code: string;
  status: "ACTIVE" | "ARCHIVED";
}

interface HubState {
  requestKey: string;
  classes?: HubClass[];
  error?: string;
}

const TUTOR_PAGE_SIZE = 100;

export default function DiscussionHubPage({ variant }: { variant: DiscussionVariant }) {
  const { state } = useAuth();
  const userId = state.status === "authenticated" ? state.user.userId : undefined;
  const [result, setResult] = useState<HubState>();
  const requestKey = `${variant}:${userId ?? ""}`;
  const loading = result?.requestKey !== requestKey;
  const data = loading ? undefined : result;

  useEffect(() => {
    const controller = new AbortController();
    const load = variant === "tutor" ? loadTutorClasses : loadStudentClasses;
    load(controller.signal)
      .then((classes) => {
        if (!controller.signal.aborted) setResult({ requestKey, classes });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setResult({ requestKey, error: discussionErrorText(cause) });
      });
    return () => controller.abort();
  }, [variant, requestKey]);

  const basePath = variant === "tutor" ? "/tutor/classes" : "/classes";
  const layoutProps = { currentPage: "Discussion" };
  const body = (
    <main className="discussions-page">
      <Typography.Title level={2}>Class discussions</Typography.Title>
      <Typography.Paragraph type="secondary">
        {variant === "tutor"
          ? "Read and moderate the discussions of the classes you teach."
          : "Read and post in the discussions of the classes you are an active member of."}
      </Typography.Paragraph>
      {loading ? (
        <div className="discussions__loading" role="status" aria-live="polite"><Spin /><span>Loading your classes…</span></div>
      ) : data?.error ? (
        <Alert type="error" showIcon title="Could not load your classes" description={data.error} />
      ) : !data?.classes?.length ? (
        <Empty description={variant === "tutor"
          ? "You do not teach any class yet."
          : "You have no active class membership yet. Join a class to take part in its discussions."} />
      ) : (
        <div className="discussions__hub-list">
          {data.classes.map((item) => (
            <Card key={item.class_id} className="discussions__hub-card" size="small">
              <div>
                <Typography.Text strong>{item.title}</Typography.Text>
                <div className="discussions__hub-meta">
                  {item.class_code} <Tag>{item.status}</Tag>
                </div>
              </div>
              <Link to={`${basePath}/${item.class_id}/discussions`}>
                <Button type="primary">Open discussions</Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </main>
  );

  return variant === "tutor"
    ? <TutorWorkspaceLayout {...layoutProps}>{body}</TutorWorkspaceLayout>
    : <StudentWorkspaceLayout {...layoutProps}>{body}</StudentWorkspaceLayout>;
}

// Only ACTIVE memberships grant discussion access, so PENDING classes are not listed here.
// /me/classes returns identifiers only, so each class needs its own detail read for title and tutor.
async function loadStudentClasses(signal: AbortSignal): Promise<HubClass[]> {
  const memberships = await getCurrentMemberships(signal);
  const activeIds = memberships.filter((item) => item.status === "ACTIVE").map((item) => item.class_id);
  const details = await Promise.all(activeIds.map((classId) => getClassDetails(classId, signal)));
  return details.map(toHubClass);
}

async function loadTutorClasses(signal: AbortSignal): Promise<HubClass[]> {
  const classes: TutorClass[] = [];
  let page = 1;
  for (;;) {
    const response = await getTutorClasses({ page, size: TUTOR_PAGE_SIZE, sort: "created_at,desc" }, signal);
    classes.push(...response.items);
    if (page >= response.total_pages) break;
    page += 1;
  }
  return classes.map(toHubClass);
}

function toHubClass(item: ClassCatalogItem | TutorClass): HubClass {
  return { class_id: item.class_id, title: item.title, class_code: item.class_code, status: item.status };
}