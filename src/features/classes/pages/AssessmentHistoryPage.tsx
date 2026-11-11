import { useEffect, useState } from "react";
import { Alert, Card, Empty, Spin, Table, Tag, Typography } from "antd";
import StudentWorkspaceLayout from "../../../components/layout/StudentWorkspaceLayout";
import { normalizeApiError } from "@/api/apiError";
import { getAssessmentHistory } from "../api/quizApi";
import type { AssessmentHistoryItem } from "../quiz-types";

export default function AssessmentHistoryPage() {
  const [items, setItems] = useState<AssessmentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    getAssessmentHistory(controller.signal)
      .then((response) => setItems(response.items))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(normalizeApiError(cause).message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  return (
    <StudentWorkspaceLayout currentPage="Assessment History">
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: 32 }}>
        <Typography.Title level={2}>Assessment history</Typography.Title>
        <Typography.Paragraph type="secondary">Your submitted quiz attempts across classes.</Typography.Paragraph>
        {loading ? <div role="status" style={{ padding: 48, textAlign: "center" }}><Spin /> Loading history…</div>
          : error ? <Alert type="error" showIcon title="Could not load assessment history" description={error} />
            : <Card>{items.length === 0 ? <Empty description="No submitted quiz attempts yet." /> : (
              <Table rowKey="attempt_id" dataSource={items} pagination={false} columns={[
                { title: "Quiz", dataIndex: "activity_title", render: (value: string) => value },
                { title: "Class", dataIndex: "class_title" },
                { title: "Attempt", dataIndex: "attempt_number" },
                { title: "Score", dataIndex: "score", render: (value: number | null) => value == null ? "—" : `${value}%` },
                { title: "Status", dataIndex: "passed", render: (value: boolean | null, item: AssessmentHistoryItem) => <Tag color={value === true ? "green" : value === false ? "red" : "blue"}>{item.auto_submitted ? "Auto-submitted" : value == null ? "Submitted" : value ? "Passed" : "Not passed"}</Tag> },
                { title: "Submitted", dataIndex: "submitted_at", render: (value: string | null) => value ? new Date(value).toLocaleString() : "—" },
              ]} />
            )}</Card>}
      </main>
    </StudentWorkspaceLayout>
  );
}
