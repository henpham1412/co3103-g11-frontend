import { useEffect, useState } from "react";
import { Alert, Spin } from "antd";
import { useParams } from "react-router-dom";

import { normalizeApiError } from "@/api/apiError";
import { useAuth } from "@/hooks/useAuth";
import StudentWorkspaceLayout from "../../../components/layout/StudentWorkspaceLayout";
import TutorWorkspaceLayout from "../../../components/layout/TutorWorkspaceLayout";
import { getClassDetails } from "../../classes/api/classApi";
import type { ClassCatalogItem } from "../../classes/types";
import DiscussionBoard from "../components/DiscussionBoard";
import type { DiscussionVariant } from "./DiscussionHubPage";
import { discussionErrorText } from "../utils/discussionErrorText";
import "../discussions.css";

interface BoardPageState {
  requestKey: string;
  classItem?: ClassCatalogItem;
  error?: string;
  status?: number;
}

export default function DiscussionBoardPage({ variant }: { variant: DiscussionVariant }) {
  const { classId = "" } = useParams();
  const { state } = useAuth();
  const currentUserId = state.status === "authenticated" ? state.user.userId : undefined;
  const currentUserName = state.status === "authenticated" ? state.user.fullName : undefined;
  const [result, setResult] = useState<BoardPageState>();
  const requestKey = `${variant}:${classId}`;
  const loading = result?.requestKey !== requestKey;
  const data = loading ? undefined : result;

  useEffect(() => {
    if (!classId) return;
    const controller = new AbortController();
    getClassDetails(classId, controller.signal)
      .then((classItem) => {
        if (!controller.signal.aborted) setResult({ requestKey, classItem });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const failure = normalizeApiError(cause);
        setResult({ requestKey, error: discussionErrorText(cause), status: failure.status });
      });
    return () => controller.abort();
  }, [classId, requestKey]);

  const basePath = `${variant === "tutor" ? "/tutor/classes" : "/classes"}/${classId}/discussions`;
  let content;
  if (loading) {
    content = <div className="discussions__loading" role="status" aria-live="polite"><Spin /><span>Loading class…</span></div>;
  } else if (data?.error || !data?.classItem) {
    content = (
      <Alert
        type={data?.status === 403 || data?.status === 404 ? "warning" : "error"}
        showIcon
        title={data?.status === 404 ? "Class is unavailable" : "Could not open this class discussion"}
        description={data?.error ?? "This class no longer exists."}
      />
    );
  } else {
    content = <DiscussionBoard classItem={data.classItem} currentUserId={currentUserId} currentUserName={currentUserName} basePath={basePath} />;
  }

  const body = <main className="discussions-page">{content}</main>;
  return variant === "tutor"
    ? <TutorWorkspaceLayout currentPage="Class Discussions">{body}</TutorWorkspaceLayout>
    : <StudentWorkspaceLayout currentPage="Class Catalog > Class Discussions">{body}</StudentWorkspaceLayout>;
}