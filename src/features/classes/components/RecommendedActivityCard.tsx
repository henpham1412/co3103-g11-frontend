import { useCallback } from "react";
import { Alert, Button, Card, Empty, Spin, Tag, Typography } from "antd";
import { Link } from "react-router-dom";
import { getRecommendedActivities } from "../api/recommendationApi";
import { useProgressResource } from "../hooks/useProgressResource";
import { recommendedActivityPath } from "../progressModel";
import type { ClassProgressResponse } from "../types";
import type { RecommendedActivity } from "../recommendation-types";

/** Mounted by ClassProgressPanel only after a successful canonical CLASS_OUTLINE resume read. */
export default function RecommendedActivityCard({ classId, progress, busy, onOpen, onRefresh }: {
  classId: string; progress: ClassProgressResponse; busy?: boolean;
  onOpen: (activity: RecommendedActivity) => void; onRefresh: () => void;
}) {
  const load = useCallback((signal: AbortSignal) => getRecommendedActivities(classId, signal), [classId]);
  const { data, error, loading } = useProgressResource(classId, load);
  if (loading) return <div role="status"><Spin /> Loading recommended activity…</div>;
  if (error) return <Alert type="error" showIcon title="Could not load recommended activity" description={error}
    action={<Button onClick={onRefresh}>Retry recommendation</Button>} />;
  if (!data) return null;
  if (!data.recommendation) return <Card title="Next learning activity">
    <Empty description={data.reason === "CLASS_ARCHIVED" ? "This class is archived. No new learning activity is recommended." : "No eligible activity is available."} />
    <Link to={`/classes/${classId}`}>View class outline</Link>
  </Card>;
  const activity = data.recommendation;
  const path = recommendedActivityPath(classId, progress, activity.activity_id);
  return <Card title="Recommended next Quiz">
    <Typography.Title level={5}>{activity.title}</Typography.Title>
    <Tag>{activity.reason === "ADDITIONAL_PRACTICE" ? "Additional practice" : "Next learning activity"}</Tag>
    {activity.skill_topics.length ? activity.skill_topics.map(topic => <Tag key={topic.skill_topic_id}>
      {topic.name}: {topic.mastery_level === null ? "No assessment evidence" : topic.mastery_level === "WEAK" ? "Weak" : topic.mastery_level === "DEVELOPING" ? "Developing" : "Sufficient"}
    </Tag>) : <Typography.Paragraph>No topic information is associated with this activity.</Typography.Paragraph>}
    {path ? <Button type="primary" loading={busy} onClick={() => onOpen(activity)}>Open recommended Quiz</Button>
      : <Alert type="warning" showIcon title="Recommended activity is unavailable" description="The Quiz could not be found in current class progress. Refresh before opening it."
        action={<Button onClick={onRefresh}>Refresh recommendation</Button>} />}
    <Typography.Paragraph type="secondary">Availability and permission are checked again when you open the learning activity.</Typography.Paragraph>
  </Card>;
}
