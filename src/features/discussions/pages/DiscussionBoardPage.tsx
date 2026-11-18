import { useEffect, useState } from "react";
import { Alert, Spin } from "antd";
import { useParams, useSearchParams } from "react-router-dom";

import { normalizeApiError } from "@/api/apiError";
import { useAuth } from "@/hooks/useAuth";
import StudentWorkspaceLayout from "../../../components/layout/StudentWorkspaceLayout";
import TutorWorkspaceLayout from "../../../components/layout/TutorWorkspaceLayout";
import { getClassDetails, getClassOutline, getStudentLesson } from "../../classes/api/classApi";
import type { ClassCatalogItem } from "../../classes/types";
import DiscussionBoard from "../components/DiscussionBoard";
import type { DiscussionVariant } from "./DiscussionHubPage";
import { discussionErrorText } from "../utils/discussionErrorText";
import "../discussions.css";

interface BoardPageState {
  requestKey: string;
  classItem?: ClassCatalogItem;
  lesson?: { lesson_id: string; title: string };
  error?: string;
  status?: number;
}

export default function DiscussionBoardPage({ variant }: { variant: DiscussionVariant }) {
  const { classId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const lessonId = searchParams.get("lesson_id") ?? "";
  const { state } = useAuth();
  const currentUserId = state.status === "authenticated" ? state.user.userId : undefined;
  const currentUserName = state.status === "authenticated" ? state.user.fullName : undefined;
  const [result, setResult] = useState<BoardPageState>();
  const requestKey = `${variant}:${classId}:${lessonId}`;
  const loading = result?.requestKey !== requestKey;
  const data = loading ? undefined : result;

  useEffect(() => {
    if (!classId) return;
    const controller = new AbortController();
    Promise.all([
      getClassDetails(classId, controller.signal),
      lessonId ? Promise.all([getClassOutline(classId, controller.signal), getStudentLesson(lessonId, controller.signal)]) : undefined,
    ]).then(([classItem, context]) => {
      if (controller.signal.aborted) return;
      if (context && (context[0].class_id !== classId || !context[0].chapters.some((chapter) =>
        chapter.lessons.some((lesson) => lesson.lesson_id === lessonId)))) {
        setResult({ requestKey, error: "This lesson is not in the accessible class outline.", status: 404 });
      } else {
        setResult({ requestKey, classItem, lesson: context?.[1] });
      }
    })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const failure = normalizeApiError(cause);
        setResult({ requestKey, error: discussionErrorText(cause), status: failure.status });
      });
    return () => controller.abort();
  }, [classId, lessonId, requestKey]);

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
    content = <DiscussionBoard key={requestKey} lesson={data.lesson} classItem={data.classItem} currentUserId={currentUserId} currentUserName={currentUserName} basePath={basePath} />;
  }

  const body = <main className="discussions-page">{content}</main>;
  return variant === "tutor"
    ? <TutorWorkspaceLayout currentPage="Class Discussions">{body}</TutorWorkspaceLayout>
    : <StudentWorkspaceLayout currentPage="Class Catalog > Class Discussions">{body}</StudentWorkspaceLayout>;
}