import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Collapse, Empty, Progress, Spin, Tag, Typography } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { normalizeApiError } from "@/api/apiError";
import { getClassProgress, getResumeTarget } from "../api/progressApi";
import { useProgressResource } from "../hooks/useProgressResource";
import { resumePath } from "../progressModel";
import "../progress.css";

export default function ClassProgressPanel({ classId }: { classId: string }) {
  const navigate = useNavigate();
  const load = useCallback((signal: AbortSignal) => getClassProgress(classId, signal), [classId]);
  const { data: progress, error, loading, retry } = useProgressResource(classId, load);
  const pending = useRef<AbortController | undefined>(undefined);
  const [action, setAction] = useState<{ classId: string; busy?: boolean; error?: string }>();
  useEffect(() => () => pending.current?.abort(), [classId]);
  async function resume() {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setAction({ classId, busy: true });
    try {
      const target = await getResumeTarget(classId, controller.signal);
      const current = target.target_type === "QUIZ_ATTEMPT" ? await getClassProgress(classId, controller.signal) : progress;
      const path = current && resumePath(classId, current, target);
      if (!path) throw new Error("The resume target is no longer available. Refresh learning progress and try again.");
      if (!controller.signal.aborted) { setAction({ classId }); navigate(path); }
    } catch (cause) {
      if (!controller.signal.aborted) setAction({ classId, error: normalizeApiError(cause).message });
    }
  }
  if (loading) return <div className="progress-loading" role="status"><Spin /> Loading progress…</div>;
  if (error) return <Alert type="error" showIcon title="Could not load learning progress" description={error} action={<Button onClick={retry}>Try again</Button>} />;
  if (!progress) return <Empty description="No progress is available." />;
  return <section className="class-progress">
    {action?.classId === classId && action.error && <Alert type="warning" title="Progress action unavailable" description={action.error} />}
    <Card className="class-progress__summary">
      <Typography.Title level={4}>Learning progress</Typography.Title>
      <Typography.Text>{progress.completed_lessons} of {progress.eligible_lessons} lessons complete</Typography.Text>
      <Tag>{progress.status === "COMPLETED" ? "Completed" : "In progress"}</Tag>
      <Progress percent={progress.progress_percentage} />
      <Button type="primary" onClick={() => void resume()} loading={action?.classId === classId && action.busy}>Continue learning</Button>
      {progress.resume_target.target_type === "CLASS_OUTLINE" && <Typography.Text>No unfinished learning target remains. Review the class outline.</Typography.Text>}
    </Card>
    {progress.chapters.length === 0 ? <Empty description="No eligible lessons" /> : <Collapse items={progress.chapters.map(chapter => ({
      key: chapter.chapter_id, label: `${chapter.title} (${chapter.completed_lessons}/${chapter.eligible_lessons})`,
      children: chapter.lessons.map(lesson => <div className="class-progress__lesson" key={lesson.lesson_id}>
        <span>{lesson.completed ? "✓" : "○"}</span><Link to={`/classes/${classId}/lessons/${lesson.lesson_id}`}>{lesson.title}</Link>
        {lesson.assessment_statuses.map(item => <Tag key={item.activity_id}>{item.title}: {item.status === "IN_PROGRESS" ? "In progress" : item.status === "SUBMITTED" ? "Submitted" : "Not started"}</Tag>)}
      </div>)
    }))} />}
  </section>;
}
