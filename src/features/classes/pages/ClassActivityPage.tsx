import { useEffect, useState } from "react";
import { Alert, Spin } from "antd";
import { useParams } from "react-router-dom";
import { normalizeApiError } from "@/api/apiError";
import { getStudentLesson } from "../api/classApi";
import type { ClassOutlineActivity } from "../types";
import QuizActivityPage from "./QuizActivityPage";
import AssignmentActivityPage from "./AssignmentActivityPage";
import ClassActivityPlaceholderPage from "./ClassActivityPlaceholderPage";

export default function ClassActivityPage() {
  const { lessonId = "", activityId = "" } = useParams();
  const [activity, setActivity] = useState<ClassOutlineActivity>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    getStudentLesson(lessonId, controller.signal).then((lesson) => {
      const found = lesson.activities?.find((item) => item.activity_id === activityId);
      if (found) setActivity(found);
      else setError("This activity is not available in the lesson.");
    }).catch((cause: unknown) => setError(normalizeApiError(cause).message));
    return () => controller.abort();
  }, [lessonId, activityId]);
  if (error) return <Alert type="error" title="Could not load activity" description={error} />;
  if (!activity) return <div role="status"><Spin /> Loading activity…</div>;
  if (activity.activity_type === "QUIZ") return <QuizActivityPage />;
  if (activity.activity_type === "ASSIGNMENT") {
    return (
      <AssignmentActivityPage
        activityTitle={activity.title}
        activityDescription={activity.description}
      />
    );
  }
  return <ClassActivityPlaceholderPage />;
}
