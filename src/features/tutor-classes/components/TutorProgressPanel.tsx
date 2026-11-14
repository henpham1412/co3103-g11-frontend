import { useCallback, useState } from "react";
import { Alert, Button, Card, Collapse, Empty, Progress, Spin, Tag, Typography } from "antd";
import { getTutorClassProgress, getTutorMemberProgress } from "../api/tutorClassApi";
import { useProgressResource } from "../../classes/hooks/useProgressResource";
import TutorMasterySection from "./TutorMasterySection";

export default function TutorProgressPanel({ classId, revision }: { classId: string; revision: number }) {
  const load = useCallback((signal: AbortSignal) => getTutorClassProgress(classId, signal), [classId]);
  const [accessRevision, setAccessRevision] = useState(0);
  const { data, loading, error, retry } = useProgressResource(`${classId}:${revision}:${accessRevision}`, load);
  const [selection, setSelection] = useState<{ classId: string; memberId: string }>();
  const [accessNotice, setAccessNotice] = useState<{ classId: string; revision: number; message: string }>();
  const accessRejected = useCallback((message: string) => {
    setSelection(undefined);
    setAccessNotice({ classId, revision, message });
    setAccessRevision(value => value + 1);
  }, [classId, revision]);
  const selected = selection?.classId === classId && data?.members.some(m => m.class_member_id === selection.memberId) ? selection.memberId : undefined;
  if (loading) return <div role="status"><Spin /> Loading member progress…</div>;
  if (error) return <Alert type="error" showIcon title="Could not load member progress" description={error} action={<Button onClick={retry}>Try again</Button>} />;
  if (!data?.members.length) return <Empty description="No active member progress is available" />;
  return <section aria-label="Tutor learning progress">
    <Typography.Title level={3}>Learning progress</Typography.Title>
    <Typography.Paragraph>Progress is shown for active members only. Historical records are retained.</Typography.Paragraph>
    {accessNotice?.classId === classId && accessNotice.revision === revision && <Alert type="warning" showIcon title="Student mastery is unavailable" description={accessNotice.message} />}
    {data.members.map(member => <Button key={member.class_member_id} onClick={() => { setAccessNotice(undefined); setSelection({ classId, memberId: member.class_member_id }); }}>
      {member.student_name ?? `Student ${member.student_id}`} · {member.completed_lessons}/{member.eligible_lessons} lessons
    </Button>)}
    {selected && <MemberProgress key={`${classId}:${selected}:${revision}`} classId={classId} memberId={selected} revision={revision} onAccessRejected={accessRejected} />}
  </section>;
}
function MemberProgress({ classId, memberId, revision, onAccessRejected }: { classId: string; memberId: string; revision: number; onAccessRejected: (message: string) => void }) {
  const load = useCallback((signal: AbortSignal) => getTutorMemberProgress(classId, memberId, signal), [classId, memberId]);
  const { data, error, loading, retry } = useProgressResource(`${classId}:${memberId}:${revision}`, load);
  if (loading) return <div role="status"><Spin /> Loading student progress…</div>;
  if (error) return <Alert type="error" showIcon title="Could not load student progress" description={error} action={<Button onClick={retry}>Try again</Button>} />;
  if (!data) return <Empty description="No student progress is available" />;
  return <Card title={`Student ${data.student_id}`}>
    <Progress percent={data.progress_percentage} />
    <Typography.Text>{data.completed_lessons} of {data.eligible_lessons} lessons complete · {data.status}</Typography.Text>
    <Collapse items={data.chapters.map(chapter => ({ key: chapter.chapter_id, label: chapter.title,
      children: chapter.lessons.map(lesson => <div key={lesson.lesson_id}>{lesson.completed ? "✓" : "○"} {lesson.title}</div>) }))} />
    <Typography.Title level={5}>Assessment outcomes</Typography.Title>
    {data.assessment_outcomes.length ? data.assessment_outcomes.map(outcome => <div key={outcome.attempt_id}>
      {outcome.activity_title} · Attempt {outcome.attempt_number} · {outcome.status}{outcome.score == null ? "" : ` · ${outcome.score}%`}{outcome.feedback ? ` · ${outcome.feedback}` : ""}
    </div>) : <Empty description="No assessment outcomes" />}
    {data.skill_mastery.map(item => <Tag key={item.skill_topic_id}>{item.name}: {item.level ?? "No assessment evidence"}</Tag>)}
    <TutorMasterySection classId={classId} memberId={memberId} revision={revision} onAccessRejected={onAccessRejected} />
  </Card>;
}
