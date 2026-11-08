import { useEffect, useState } from "react";
import { Alert, Button, Card, Collapse, Empty, Progress, Spin, Tag, Typography } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { normalizeApiError } from "@/api/apiError";
import { getClassProgress, getResumeTarget } from "../api/progressApi";
import { getAssessmentHistory } from "../api/quizApi";
import type { ClassProgressResponse } from "../types";
import "../progress.css";

export default function ClassProgressPanel({ classId }: { classId: string }) {
  const navigate = useNavigate();
  const [progress, setProgress] = useState<ClassProgressResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [resuming, setResuming] = useState(false);

  function load() {
    setLoading(true);
    setError(undefined);
    const controller = new AbortController();
    getClassProgress(classId, controller.signal)
      .then(setProgress)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(normalizeApiError(cause).message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }

  useEffect(() => {
    // The request state is synchronized asynchronously by the loader.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const cleanup = load();
    return cleanup;
    // The loader is intentionally recreated only when the class changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  async function resume() {
    setResuming(true);
    try {
      const target = await getResumeTarget(classId);
      if (target.target_type === "LESSON") navigate(`/classes/${classId}/lessons/${target.target_id}`);
      else if (target.target_type === "QUIZ_ATTEMPT") {
        const history = await getAssessmentHistory({ class_id: classId, type: "QUIZ" });
        const assessment = history.items.find((item) => item.attempt_id === target.target_id);
        if (!assessment || assessment.status !== "IN_PROGRESS") {
          throw new Error("The in-progress quiz attempt is no longer available.");
        }
        const lesson = progress?.chapters
          .flatMap((chapter) => chapter.lessons)
          .find((candidate) => candidate.activities?.some((activity) => activity.activity_id === assessment.activity_id));
        if (!lesson) throw new Error("The in-progress quiz is not available in the class outline.");
        const activityId = assessment.activity_id;
        const lessonId = lesson.lesson_id;
        navigate(`/classes/${classId}/lessons/${lessonId}/activities/${activityId}`);
      } else if (target.target_type === "CLASS_OUTLINE") {
        setProgress((current) => current ? { ...current, resume_target: target } : current);
      } else {
        setError("The quiz resume target could not be resolved to a quiz activity.");
      }
    } catch (cause) {
      setError(normalizeApiError(cause).message);
    } finally {
      setResuming(false);
    }
  }

  if (loading) return <div className="progress-loading" role="status"><Spin /> Loading progress…</div>;
  if (error && !progress) return <Alert type="error" showIcon title="Could not load learning progress" description={error} />;
  if (!progress) return <Empty description="No progress is available." />;

  return (
    <section className="class-progress">
      {error && <Alert type="warning" showIcon title="Progress action unavailable" description={error} />}
      <Card className="class-progress__summary">
        <div className="class-progress__summary-row">
          <div><Typography.Title level={4}>Learning progress</Typography.Title><Typography.Text type="secondary">{progress.completed_lessons} of {progress.eligible_lessons} lessons complete</Typography.Text></div>
          <Tag color={progress.status === "COMPLETED" ? "green" : "blue"}>{progress.status === "COMPLETED" ? "Completed" : "In progress"}</Tag>
        </div>
        <Progress percent={progress.progress_percentage} />
        <Button type="primary" onClick={resume} loading={resuming} disabled={progress.status === "COMPLETED" && !progress.resume_target}>Continue learning</Button>
        {progress.resume_target?.target_type === "CLASS_OUTLINE" && <Typography.Text type="secondary">No unfinished learning target remains. Review the class outline.</Typography.Text>}
      </Card>
      <Collapse items={progress.chapters.map((chapter) => ({
        key: chapter.chapter_id,
        label: <span>{chapter.title} <Typography.Text type="secondary">({chapter.completed_lessons}/{chapter.eligible_lessons})</Typography.Text></span>,
        children: chapter.lessons.length > 0 ? chapter.lessons.map((lesson) => (
          <div className="class-progress__lesson" key={lesson.lesson_id}>
            <span className={lesson.completed ? "is-complete" : ""}>{lesson.completed ? "✓" : "○"}</span>
            <Link to={`/classes/${classId}/lessons/${lesson.lesson_id}`}>{lesson.title}</Link>
            {lesson.activities?.map((activity) => <Tag key={activity.activity_id}>{activity.title}: {activity.outcome ?? activity.status ?? "Not started"}</Tag>)}
          </div>
        )) : <Empty description="No eligible lessons" />,
      }))} />
    </section>
  );
}
