import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, App, Button, Card, Col, Empty, Form, Input, InputNumber,
  Pagination, Row, Spin, Tag, Typography,
} from "antd";
import {
  ArrowLeftOutlined, CheckCircleOutlined, ClockCircleOutlined, DownloadOutlined, FileOutlined,
} from "@ant-design/icons";
import { Link, useParams } from "react-router-dom";
import { normalizeApiError } from "@/api/apiError";
import TutorWorkspaceLayout from "../../../components/layout/TutorWorkspaceLayout";
import {
  downloadSubmission,
  getSubmission,
  getTutorAssignment,
  gradeSubmission,
  listSubmissions,
  type SubmissionListItem,
} from "../api/tutorAssignmentApi";
import { triggerBlobDownload } from "../../classes/api/assignmentApi";
import type { AssignmentSubmission } from "../../classes/api/assignmentApi";

const PAGE_SIZE = 20;

type GradeForm = { score: number; feedback?: string };

export default function TutorAssignmentGradingPage() {
  const { classId = "", activityId = "" } = useParams();
  const { message } = App.useApp();

  const assignmentIdRef = useRef<{ activityId: string; assignmentId: string } | undefined>(undefined);
  const [submissions, setSubmissions] = useState<SubmissionListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string>();

  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<AssignmentSubmission>();
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [form] = Form.useForm<GradeForm>();

  const loadList = useCallback(async (targetPage: number, signal?: AbortSignal) => {
    setLoadingList(true);
    setListError(undefined);
    try {
      let resolvedId =
        assignmentIdRef.current?.activityId === activityId
          ? assignmentIdRef.current.assignmentId
          : undefined;
      if (!resolvedId) {
        const cfg = await getTutorAssignment(activityId, signal);
        if (signal?.aborted) return;
        resolvedId = cfg.assignment_id;
        assignmentIdRef.current = { activityId, assignmentId: resolvedId };
      }
      const result = await listSubmissions(resolvedId, { page: targetPage, size: PAGE_SIZE }, signal);
      if (signal?.aborted) return;
      setSubmissions(result.items);
      setTotalItems(result.total_items);
    } catch (cause: unknown) {
      if (!signal?.aborted) setListError(normalizeApiError(cause).message);
    } finally {
      if (!signal?.aborted) setLoadingList(false);
    }
  }, [activityId]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList(page, controller.signal);
    return () => controller.abort();
  }, [loadList, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selectedId) { setDetail(undefined); return; }
    const controller = new AbortController();
    setLoadingDetail(true);
    setDetail(undefined);
    getSubmission(selectedId, controller.signal)
      .then((sub) => {
        if (controller.signal.aborted) return;
        setDetail(sub);
        form.setFieldsValue({
          score: sub.score ?? undefined,
          feedback: sub.feedback ?? undefined,
        });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) message.error(normalizeApiError(cause).message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingDetail(false); });
    return () => controller.abort();
  }, [selectedId, form, message]);

  async function handleGrade(values: GradeForm) {
    if (!detail) return;
    setSaving(true);
    try {
      const updated = await gradeSubmission(detail.submission_id, {
        score: values.score,
        feedback: values.feedback,
        version: detail.version,
      });
      setDetail(updated);
      // Update the list item in-place
      setSubmissions((prev) =>
        prev.map((item) =>
          item.submission_id === updated.submission_id
            ? { ...item, status: updated.status, score: updated.score }
            : item,
        ),
      );
      message.success("Grade saved.");
    } catch (cause: unknown) {
      const failure = normalizeApiError(cause);
      if (failure.code === "SUBMISSION_STATE_CHANGED") {
        message.error("The submission was updated by the student while you were grading. Reloading…");
        const conflictId = detail.submission_id;
        const refreshed = await getSubmission(conflictId).catch(() => undefined);
        if (refreshed && selectedId === conflictId) {
          setDetail(refreshed);
          form.setFieldsValue({ score: refreshed.score ?? undefined, feedback: refreshed.feedback ?? undefined });
        }
      } else {
        message.error(failure.message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    if (!detail) return;
    setDownloading(true);
    try {
      const { blob, filename } = await downloadSubmission(detail.submission_id);
      triggerBlobDownload(blob, filename || detail.file_name);
    } catch (cause: unknown) {
      message.error(normalizeApiError(cause).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <TutorWorkspaceLayout currentPage="Grading & Feedback">
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 32 }}>
        <Link to={`/tutor/classes/${classId}/content/assignment/${activityId}`}>
          <ArrowLeftOutlined /> Back to Assignment
        </Link>
        <Typography.Title level={2} style={{ marginTop: 16 }}>Grading &amp; Feedback</Typography.Title>
        <Typography.Paragraph type="secondary">
          Review submissions, assign scores, and provide feedback.
        </Typography.Paragraph>

        {listError && (
          <Alert type="error" showIcon title="Could not load submissions" description={listError}
            action={<Button onClick={() => void loadList(page)}>Retry</Button>}
            style={{ marginBottom: 16 }}
          />
        )}

        <Row gutter={24} align="top">
          {/* ── Left: student list ── */}
          <Col xs={24} md={8}>
            <Card
              title={loadingList ? <Spin size="small" /> : `Submissions (${totalItems})`}
              styles={{ body: { padding: 0 } }}
            >
              {!loadingList && submissions.length === 0 ? (
                <Empty description="No submissions yet." style={{ padding: 24 }} />
              ) : (
                <div>
                  {submissions.map((item) => (
                    <button
                      key={item.submission_id}
                      type="button"
                      onClick={() => setSelectedId(item.submission_id)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 16px",
                        border: "none",
                        borderBottom: "1px solid #f0f0f0",
                        background: selectedId === item.submission_id ? "#e6f4ff" : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div>
                        <Typography.Text strong>
                          {item.student_name ?? item.student_id}
                        </Typography.Text>
                        {item.is_late && (
                          <Tag color="orange" style={{ marginLeft: 6 }}>
                            <ClockCircleOutlined /> Late
                          </Tag>
                        )}
                        <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 2 }}>
                          {new Date(item.submitted_at).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {item.status === "GRADED" ? (
                          <>
                            <CheckCircleOutlined style={{ color: "#52c41a" }} />
                            <Typography.Text style={{ marginLeft: 4, fontSize: 13 }}>
                              {item.score ?? "—"}
                            </Typography.Text>
                          </>
                        ) : (
                          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                            Needs grading
                          </Typography.Text>
                        )}
                      </div>
                    </button>
                  ))}
                  {totalItems > PAGE_SIZE && (
                    <div style={{ padding: "12px 16px", display: "flex", justifyContent: "center" }}>
                      <Pagination
                        size="small"
                        current={page}
                        pageSize={PAGE_SIZE}
                        total={totalItems}
                        showSizeChanger={false}
                        onChange={setPage}
                      />
                    </div>
                  )}
                </div>
              )}
            </Card>
          </Col>

          {/* ── Right: grade panel ── */}
          <Col xs={24} md={16}>
            {!selectedId ? (
              <Card>
                <Empty description="Select a student from the list to begin grading." />
              </Card>
            ) : loadingDetail ? (
              <Card>
                <div role="status" style={{ textAlign: "center", padding: 32 }}>
                  <Spin /> Loading submission…
                </div>
              </Card>
            ) : !detail ? (
              <Card>
                <Alert type="error" showIcon title="Could not load this submission." />
              </Card>
            ) : (
              <Card>
                {/* File header */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                  <FileOutlined style={{ fontSize: 24, color: "#1677ff" }} />
                  <div style={{ flex: 1 }}>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      {submissions.find((s) => s.submission_id === selectedId)?.student_name ?? "Student"}
                      {" · "}
                      <Button
                        type="link"
                        style={{ padding: 0, fontSize: "inherit", fontWeight: 600 }}
                        icon={<DownloadOutlined />}
                        loading={downloading}
                        onClick={() => void handleDownload()}
                      >
                        {detail.file_name}
                      </Button>
                    </Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      {detail.mime_type} · {(detail.size_bytes / 1024).toFixed(0)} KB
                      {" · Submitted "}
                      {new Date(detail.submitted_at).toLocaleString()}
                      {detail.is_late && (
                        <Tag color="orange" style={{ marginLeft: 8 }}>
                          <ClockCircleOutlined /> Late
                        </Tag>
                      )}
                    </Typography.Text>
                  </div>
                </div>

                {detail.status === "GRADED" && (
                  <Alert
                    type="success"
                    showIcon
                    title={`Already graded — Score: ${detail.score ?? "—"} / 100`}
                    description="You can update the grade below."
                    style={{ marginBottom: 16 }}
                  />
                )}

                <Form form={form} layout="vertical" onFinish={handleGrade}>
                  <Form.Item
                    name="score"
                    label="Score (0–100)"
                    rules={[
                      { required: true, message: "Score is required." },
                      { type: "number", min: 0, max: 100, message: "Score must be between 0 and 100." },
                    ]}
                  >
                    <InputNumber min={0} max={100} style={{ width: 120 }} />
                  </Form.Item>

                  <Form.Item name="feedback" label="Written feedback">
                    <Input.TextArea
                      rows={5}
                      placeholder="Add written feedback for the student…"
                    />
                  </Form.Item>

                  <Button type="primary" htmlType="submit" loading={saving}>
                    Save grade
                  </Button>
                </Form>
              </Card>
            )}
          </Col>
        </Row>
      </main>
    </TutorWorkspaceLayout>
  );
}
