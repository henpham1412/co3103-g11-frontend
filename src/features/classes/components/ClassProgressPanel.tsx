import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Collapse, Empty, Progress, Spin, Tag, Typography } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { normalizeApiError } from "@/api/apiError";
import { getClassProgress, getResumeTarget } from "../api/progressApi";
import { useProgressResource } from "../hooks/useProgressResource";
import { recommendedActivityPath, resumePath } from "../progressModel";
import RecommendedActivityCard from "./RecommendedActivityCard";
import type { ClassProgressResponse } from "../types";
import type { RecommendedActivity } from "../recommendation-types";
import "../progress.css";

export default function ClassProgressPanel({ classId }: { classId: string }) {
  const navigate = useNavigate();
  const load = useCallback(async (signal: AbortSignal) => {
    const current = await getClassProgress(classId, signal);
    const target = await getResumeTarget(classId, signal);
    return { ...current, resume_target: target };
  }, [classId]);
  const { data: progress, error, loading, retry } = useProgressResource(classId, load);
  const pending = useRef<AbortController | undefined>(undefined);
  const [action, setAction] = useState<{ context: ClassProgressResponse; busy?: boolean; error?: string; resumeFailed?: boolean }>();
  const currentAction = action?.context === progress ? action : undefined;
  useEffect(() => () => pending.current?.abort(), [classId]);
  function refresh() { pending.current?.abort(); retry(); }
  async function resume(recommended?: RecommendedActivity) {
    if (!progress) return;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setAction({ context: progress, busy: true, resumeFailed: currentAction?.resumeFailed });
    let resumeReadFailed = true;
    try {
      const target = await getResumeTarget(classId, controller.signal);
      resumeReadFailed = false;
      const current = target.target_type === "QUIZ_ATTEMPT" || (target.target_type === "CLASS_OUTLINE" && recommended)
        ? await getClassProgress(classId, controller.signal) : progress;
      // The later progress snapshot may already contain a newly available resume target.
      const latestTarget = target.target_type === "CLASS_OUTLINE" && recommended ? current.resume_target : target;
      const canonicalPath = latestTarget && typeof latestTarget.target_id === "string" && latestTarget.target_id.trim()
        && ["LESSON", "QUIZ_ATTEMPT", "CLASS_OUTLINE"].includes(latestTarget.target_type)
        && (latestTarget.target_type !== "CLASS_OUTLINE" || latestTarget.target_id === classId)
        ? resumePath(classId, current, latestTarget) : undefined;
      const path = canonicalPath && latestTarget.target_type === "CLASS_OUTLINE" && recommended
        ? recommendedActivityPath(classId, current, recommended.activity_id) : canonicalPath;
      if (!path) throw new Error("The learning activity is no longer available. Refresh learning progress and try again.");
      if (!controller.signal.aborted) { setAction({ context: progress }); navigate(path); }
    } catch (cause) {
      if (!controller.signal.aborted) setAction({ context: progress, error: normalizeApiError(cause).message, resumeFailed: resumeReadFailed });
    }
  }
  if (loading) return <div className="progress-loading" role="status"><Spin /> Loading progress…</div>;
  if (error) return <Alert type="error" showIcon title="Could not load learning progress" description={error} action={<Button onClick={refresh}>Try again</Button>} />;
  if (!progress) return <Empty description="No progress is available." />;
  return <section className="class-progress">
    {currentAction?.error && <Alert type="warning" title="Progress action unavailable" description={currentAction.error} action={<Button onClick={refresh}>Refresh learning progress</Button>} />}
    <Card className="class-progress__summary">
      <Typography.Title level={4}>Learning progress</Typography.Title>
      <Typography.Text>{progress.completed_lessons} of {progress.eligible_lessons} lessons complete</Typography.Text>
      <Tag>{progress.status === "COMPLETED" ? "Completed" : "In progress"}</Tag>
      <Progress percent={progress.progress_percentage} />
      <Button type="primary" onClick={() => void resume()} loading={currentAction?.busy}>Continue learning</Button>
      {progress.resume_target.target_type === "CLASS_OUTLINE" && <Typography.Text>No unfinished learning target remains. Review the class outline.</Typography.Text>}
    </Card>
    {progress.resume_target.target_type === "CLASS_OUTLINE" && !currentAction?.resumeFailed && <RecommendedActivityCard
      classId={classId} progress={progress} busy={currentAction?.busy} onOpen={activity => void resume(activity)} onRefresh={refresh} />}
    {progress.chapters.length === 0 ? <Empty description="No eligible lessons" /> : <Collapse items={progress.chapters.map(chapter => ({
      key: chapter.chapter_id, label: `${chapter.title} (${chapter.completed_lessons}/${chapter.eligible_lessons})`,
      children: chapter.lessons.map(lesson => <div className="class-progress__lesson" key={lesson.lesson_id}>
        <span>{lesson.completed ? "✓" : "○"}</span><Link to={`/classes/${classId}/lessons/${lesson.lesson_id}`}>{lesson.title}</Link>
        {lesson.assessment_statuses.map(item => <Tag key={item.activity_id}>{item.title}: {item.status === "IN_PROGRESS" ? "In progress" : item.status === "SUBMITTED" ? "Submitted" : "Not started"}</Tag>)}
      </div>)
    }))} />}
  </section>;
}
