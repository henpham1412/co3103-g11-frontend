import { useCallback, useState } from "react";
import { Alert, Button, Card, Empty, Pagination, Spin, Table, Tag, Typography } from "antd";
import { Link } from "react-router-dom";
import StudentWorkspaceLayout from "../../../components/layout/StudentWorkspaceLayout";
import { getAssessmentHistory } from "../api/quizApi";
import { useProgressResource } from "../hooks/useProgressResource";
import type { AssessmentHistoryItem } from "../quiz-types";

const PAGE_SIZE = 20;
export default function AssessmentHistoryPage() {
  const [page, setPage] = useState(1);
  const load = useCallback((signal: AbortSignal) => getAssessmentHistory(signal, { page, size: PAGE_SIZE }), [page]);
  const { data, loading, error, retry } = useProgressResource(String(page), load);
  return <StudentWorkspaceLayout currentPage="Assessment History">
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: 32 }}>
      <Typography.Title level={2}>Assessment history</Typography.Title>
      <Typography.Paragraph type="secondary">Your quiz attempts and assessment results across classes.</Typography.Paragraph>
      {loading ? <div role="status"><Spin /> Loading history…</div> : error
        ? <Alert type="error" showIcon title="Could not load assessment history" description={error} action={<Button onClick={retry}>Try again</Button>} />
        : <Card>{data?.items.length ? <Table rowKey="attempt_id" dataSource={data.items} pagination={false} columns={[
          { title: "Quiz", dataIndex: "activity_title" },
          { title: "Class", dataIndex: "class_id", render: (id: string) => <Link to={`/classes/${id}`}>View class</Link> },
          { title: "Attempt", dataIndex: "attempt_number" },
          { title: "Score", dataIndex: "score", render: (value: number | null) => value == null ? "—" : `${value}%` },
          { title: "Status", dataIndex: "status", render: (value: AssessmentHistoryItem["status"], item: AssessmentHistoryItem) => <Tag>{value === "IN_PROGRESS" ? "In progress" : item.score == null ? "Submitted · awaiting grade" : "Submitted · graded"}</Tag> },
          { title: "Submitted", dataIndex: "submitted_at", render: (value: string | null) => value ? new Date(value).toLocaleString() : "—" },
          { title: "Feedback", dataIndex: "feedback", render: (value: string | null) => value ?? "—" },
        ]} /> : <Empty description="No assessment history on this page." />}
          {data && data.total_items > 0 && <Pagination current={page} pageSize={PAGE_SIZE} total={data.total_items} showSizeChanger={false} onChange={setPage} />}
          {page > 1 && !data?.items.length && <Button onClick={() => setPage(1)}>Back to first page</Button>}
        </Card>}
    </main>
  </StudentWorkspaceLayout>;
}
