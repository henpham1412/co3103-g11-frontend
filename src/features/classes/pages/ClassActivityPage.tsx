import { useEffect, useState } from "react";
import { Alert, Spin } from "antd";
import { useParams } from "react-router-dom";
import { normalizeApiError } from "@/api/apiError";
import { getStudentLesson } from "../api/classApi";
import type { ActivityType } from "../types";
import QuizActivityPage from "./QuizActivityPage";
import ClassActivityPlaceholderPage from "./ClassActivityPlaceholderPage";

export default function ClassActivityPage() {
  const { lessonId = "", activityId = "" } = useParams();
  const [type, setType] = useState<ActivityType>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    getStudentLesson(lessonId, controller.signal).then((lesson) => {
      const activity = lesson.activities?.find((item) => item.activity_id === activityId);
      if (activity) setType(activity.activity_type);
      else setError("This activity is not available in the lesson.");
    }).catch((cause: unknown) => setError(normalizeApiError(cause).message));
    return () => controller.abort();
  }, [lessonId, activityId]);
  if (error) return <Alert type="error" title="Could not load activity" description={error} />;
  if (!type) return <div role="status"><Spin /> Loading activity…</div>;
  return type === "QUIZ" ? <QuizActivityPage /> : <ClassActivityPlaceholderPage />;
}
