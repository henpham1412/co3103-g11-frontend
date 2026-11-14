import { useCallback } from "react";
import { Alert, Button, Empty, Spin, Tag, Typography } from "antd";
import { normalizeApiError } from "@/api/apiError";
import { useProgressResource } from "../../classes/hooks/useProgressResource";
import { getTutorMastery } from "../api/tutorMasteryApi";

export default function TutorMasterySection({ classId, memberId, revision, onAccessRejected }: {
  classId: string; memberId: string; revision: number; onAccessRejected: (message: string) => void;
}) {
  const load = useCallback(async (signal: AbortSignal) => {
    try { return await getTutorMastery(classId, memberId, signal); }
    catch (cause) {
      const error = normalizeApiError(cause);
      if (!signal.aborted && (error.status === 403 || error.status === 404)) onAccessRejected(error.message);
      throw error;
    }
  }, [classId, memberId, onAccessRejected]);
  const { data, loading, error, retry } = useProgressResource(`${classId}:${memberId}:${revision}`, load);
  return <section aria-label="Topic mastery">
    <Typography.Title level={5}>Topic mastery</Typography.Title>
    {loading ? <div role="status"><Spin /> Loading topic mastery…</div>
      : error ? <Alert type="error" showIcon title="Could not load topic mastery" description={error}
        action={<Button onClick={retry}>Retry mastery</Button>} />
      : data && (data.items.length ? data.items.map(topic => <div key={topic.skill_topic_id}>
        <Typography.Text>{topic.name}: </Typography.Text>
        {topic.evidence_available ? <Tag>{topic.mastery_score}% · {topic.mastery_level}</Tag> : <Tag>No assessment evidence</Tag>}
      </div>) : <Empty description="No SkillTopics are available for this class." />)}
  </section>;
}
