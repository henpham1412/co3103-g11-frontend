import { useCallback, useState } from "react";
import { Alert, Button, Typography } from "antd";
import { normalizeApiError } from "@/api/apiError";
import { getClassProgress, markLessonComplete, unmarkLessonComplete } from "../api/progressApi";
import { useProgressResource } from "../hooks/useProgressResource";

export default function LessonCompletionControl({ classId, lessonId, archived }: { classId: string; lessonId: string; archived: boolean }) {
  const load = useCallback((signal: AbortSignal) => getClassProgress(classId, signal), [classId]);
  const { data, error, loading, retry } = useProgressResource(`${classId}:${lessonId}`, load);
  const lesson = data?.chapters.flatMap(chapter => chapter.lessons).find(item => item.lesson_id === lessonId);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string>();
  async function toggle() {
    if (!lesson || busy || archived) return;
    setBusy(true); setWriteError(undefined);
    try {
      if (lesson.completed) await unmarkLessonComplete(classId, lessonId);
      else await markLessonComplete(classId, lessonId);
      retry();
    } catch (cause) { setWriteError(normalizeApiError(cause).message); }
    finally { setBusy(false); }
  }
  return <div className="student-lesson__progress-note">
    {(error || writeError) && <Alert type="warning" title="Completion status unavailable" description={error ?? writeError} action={<Button onClick={retry}>Try again</Button>} />}
    <Button disabled={archived || !lesson || loading} loading={busy || loading} onClick={() => void toggle()}>{lesson?.completed ? "Mark as incomplete" : "Mark lesson as complete"}</Button>
    <Typography.Text type="secondary">Opening a lesson does not mark it complete.</Typography.Text>
    {archived && <Typography.Text>This archived class is read-only.</Typography.Text>}
  </div>;
}
