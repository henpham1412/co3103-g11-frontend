import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, App, Button, Card, Spin, Tag, Typography, Upload,
} from "antd";
import {
  ArrowLeftOutlined, CheckCircleOutlined, ClockCircleOutlined,
  DownloadOutlined, FileOutlined, InboxOutlined,
} from "@ant-design/icons";
import { Link, useParams } from "react-router-dom";
import { normalizeApiError } from "@/api/apiError";
import StudentWorkspaceLayout from "../../../components/layout/StudentWorkspaceLayout";
import {
  downloadAssignmentAttachment,
  getAssignmentConfig,
  getMySubmission,
  submitAssignmentFile,
  triggerBlobDownload,
  type AssignmentAttachment,
  type AssignmentConfiguration,
  type AssignmentSubmission,
} from "../api/assignmentApi";

interface Props {
  activityTitle: string;
  activityDescription?: string | null;
}

export default function AssignmentActivityPage({ activityTitle, activityDescription }: Props) {
  const { classId = "", activityId = "" } = useParams();
  const { message } = App.useApp();

  const [config, setConfig] = useState<AssignmentConfiguration>();
  const [submission, setSubmission] = useState<AssignmentSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selectedFile, setSelectedFile] = useState<File>();
  const [submitting, setSubmitting] = useState(false);
  const [downloadingAttachment, setDownloadingAttachment] = useState<string>();
  const [now] = useState(() => Date.now());

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(undefined);
    try {
      const cfg = await getAssignmentConfig(activityId, signal);
      setConfig(cfg);
      try {
        const sub = await getMySubmission(cfg.assignment_id, signal);
        setSubmission(sub);
      } catch (cause: unknown) {
        // 404 means no submission yet — that's fine
        if (normalizeApiError(cause).status !== 404) throw cause;
        setSubmission(null);
      }
    } catch (cause: unknown) {
      if (!signal.aborted) setError(normalizeApiError(cause).message);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function handleSubmit() {
    if (!config || !selectedFile) return;
    setSubmitting(true);
    try {
      const result = await submitAssignmentFile(config.assignment_id, selectedFile);
      setSubmission(result);
      setSelectedFile(undefined);
      message.success("Assignment submitted successfully.");
    } catch (cause: unknown) {
      message.error(normalizeApiError(cause).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownloadAttachment(attachment: AssignmentAttachment) {
    setDownloadingAttachment(attachment.attachment_id);
    try {
      const { blob, filename } = await downloadAssignmentAttachment(attachment.attachment_id);
      triggerBlobDownload(blob, filename);
    } catch (cause: unknown) {
      message.error(`Could not download ${attachment.file_name}: ${normalizeApiError(cause).message}`);
    } finally {
      setDownloadingAttachment(undefined);
    }
  }

  if (loading) {
    return (
      <StudentWorkspaceLayout currentPage="Class Catalog > Class Detail > Assignment">
        <main style={{ maxWidth: 1120, margin: "0 auto", padding: 32 }}>
          <div role="status" style={{ padding: 48, textAlign: "center" }}><Spin /> <span>Loading assignment…</span></div>
        </main>
      </StudentWorkspaceLayout>
    );
  }

  if (error || !config) {
    return (
      <StudentWorkspaceLayout currentPage="Class Catalog > Class Detail > Assignment">
        <main style={{ maxWidth: 1120, margin: "0 auto", padding: 32 }}>
          <Link to={`/classes/${classId}`}><ArrowLeftOutlined /> Back to class</Link>
          <Alert type="error" showIcon title="Could not load assignment" description={error ?? "Assignment not found."} style={{ marginTop: 24 }} />
        </main>
      </StudentWorkspaceLayout>
    );
  }

  const opening = config.opening_time ? new Date(config.opening_time) : null;
  const deadline = new Date(config.deadline);
  const notOpenYet = opening ? opening.getTime() > now : false;
  const pastDeadline = deadline.getTime() <= now;
  const canSubmit =
    !notOpenYet &&
    submission?.status !== "GRADED" &&
    (!pastDeadline || config.allow_late);

  const allowedLabel = config.allowed_file_types?.length
    ? config.allowed_file_types.join(", ")
    : null;
  const sizeLabel = config.max_file_size_mb ? `${config.max_file_size_mb} MB` : null;

  return (
    <StudentWorkspaceLayout currentPage="Class Catalog > Class Detail > Assignment">
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: 32 }}>
        <Link to={`/classes/${classId}`}><ArrowLeftOutlined /> Back to class</Link>
        <Typography.Title level={2} style={{ marginTop: 16 }}>{activityTitle}</Typography.Title>
        {activityDescription && (
          <Typography.Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
            {activityDescription}
          </Typography.Text>
        )}

        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* ── Left panel: Instructions ── */}
          <Card style={{ flex: "1 1 480px", minWidth: 300 }}>
            <Typography.Title level={4}>Instructions</Typography.Title>
            {activityDescription
              ? <Typography.Paragraph>{activityDescription}</Typography.Paragraph>
              : <Typography.Text type="secondary">No instructions provided.</Typography.Text>}

            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 4 }}>
              {opening && (
                <div>
                  <Typography.Text strong style={{ minWidth: 60, display: "inline-block" }}>Opens</Typography.Text>
                  <Typography.Text style={{ marginLeft: 8 }}>{opening.toLocaleString()}</Typography.Text>
                </div>
              )}
              <div>
                <Typography.Text strong style={{ minWidth: 60, display: "inline-block" }}>Due</Typography.Text>
                <Typography.Text style={{ marginLeft: 8 }}>{deadline.toLocaleString()}</Typography.Text>
              </div>
            </div>

            {(allowedLabel || sizeLabel || !config.allow_late) && (
              <Typography.Text type="secondary" style={{ display: "block", marginTop: 12, fontSize: 13 }}>
                {[
                  allowedLabel && `Allowed: ${allowedLabel}`,
                  sizeLabel && `Maximum size: ${sizeLabel}`,
                  !config.allow_late && "Late submissions not accepted",
                ].filter(Boolean).join("  |  ")}
              </Typography.Text>
            )}

            {config.attachments.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Typography.Text strong>Reference files</Typography.Text>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {config.attachments.map((att) => (
                    <Button
                      key={att.attachment_id}
                      type="link"
                      icon={<DownloadOutlined />}
                      loading={downloadingAttachment === att.attachment_id}
                      onClick={() => void handleDownloadAttachment(att)}
                      style={{ padding: 0, textAlign: "left" }}
                    >
                      {att.file_name}
                      <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                        {att.mime_type} · {(att.size_bytes / 1024).toFixed(0)} KB
                      </Typography.Text>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* ── Right panel: Submission status ── */}
          <div style={{ flex: "0 0 340px", minWidth: 280 }}>
            <SubmissionPanel
              config={config}
              submission={submission}
              selectedFile={selectedFile}
              canSubmit={canSubmit}
              notOpenYet={notOpenYet}
              pastDeadline={pastDeadline}
              submitting={submitting}
              classId={classId}
              onFileSelect={setSelectedFile}
              onSubmit={() => void handleSubmit()}
            />
          </div>
        </div>
      </main>
    </StudentWorkspaceLayout>
  );
}

function SubmissionPanel({
  config, submission, selectedFile, canSubmit, notOpenYet, pastDeadline,
  submitting, classId, onFileSelect, onSubmit,
}: {
  config: AssignmentConfiguration;
  submission: AssignmentSubmission | null;
  selectedFile: File | undefined;
  canSubmit: boolean;
  notOpenYet: boolean;
  pastDeadline: boolean;
  submitting: boolean;
  classId: string;
  onFileSelect: (file: File) => void;
  onSubmit: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (submission?.status === "GRADED") {
    return (
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 20 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>Graded</Typography.Title>
        </div>
        <Typography.Text type="secondary">Your assignment has been graded.</Typography.Text>

        <div style={{ marginTop: 16 }}>
          <Typography.Text strong>Submitted file</Typography.Text>
          <div style={{ marginTop: 6 }}>
            <FileCard fileName={submission.file_name} mimeType={submission.mime_type} sizeBytes={submission.size_bytes} />
          </div>
        </div>

        {submission.is_late && <Tag color="orange" style={{ marginTop: 8 }}><ClockCircleOutlined /> Late submission</Tag>}

        <div style={{ marginTop: 16 }}>
          <Typography.Text strong>Submitted on</Typography.Text>
          <Typography.Paragraph style={{ marginBottom: 0 }}>{new Date(submission.submitted_at).toLocaleString()}</Typography.Paragraph>
        </div>

        <div style={{ marginTop: 16 }}>
          <Typography.Text strong>Score</Typography.Text>
          <Typography.Title level={3} style={{ margin: "4px 0", color: "#1677ff" }}>
            {submission.score ?? "—"} / 100
          </Typography.Title>
        </div>

        {submission.feedback && (
          <div style={{ marginTop: 16 }}>
            <Typography.Text strong>Tutor feedback</Typography.Text>
            <Typography.Paragraph style={{ marginTop: 4, padding: 12, background: "#fafafa", borderRadius: 6 }}>
              {submission.feedback}
            </Typography.Paragraph>
          </div>
        )}

        <Button style={{ marginTop: 16 }} icon={<ArrowLeftOutlined />}>
          <Link to={`/classes/${classId}`}>Return to class</Link>
        </Button>
      </Card>
    );
  }

  if (submission?.status === "SUBMITTED") {
    return (
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 20 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>Submitted</Typography.Title>
        </div>
        <Typography.Text type="secondary">Your assignment has been submitted successfully.</Typography.Text>

        <div style={{ marginTop: 16 }}>
          <Typography.Text strong>Submitted file</Typography.Text>
          <div style={{ marginTop: 6 }}>
            <FileCard fileName={submission.file_name} mimeType={submission.mime_type} sizeBytes={submission.size_bytes} />
          </div>
        </div>

        {submission.is_late && <Tag color="orange" style={{ marginTop: 8 }}><ClockCircleOutlined /> Late submission</Tag>}

        <div style={{ marginTop: 16 }}>
          <Typography.Text strong>Submitted on</Typography.Text>
          <Typography.Paragraph style={{ marginBottom: 0 }}>{new Date(submission.submitted_at).toLocaleString()}</Typography.Paragraph>
        </div>

        <Alert type="info" showIcon title="Awaiting grading" style={{ marginTop: 16 }} />

        <Button style={{ marginTop: 16 }} icon={<ArrowLeftOutlined />}>
          <Link to={`/classes/${classId}`}>Return to class</Link>
        </Button>
      </Card>
    );
  }

  // Not submitted yet
  const allowedAccept = config.allowed_file_types?.length
    ? config.allowed_file_types.map((t) => `.${t.toLowerCase()}`).join(",")
    : undefined;
  const maxBytes = config.max_file_size_mb ? config.max_file_size_mb * 1024 * 1024 : undefined;

  return (
    <Card>
      <Typography.Title level={4} style={{ margin: "0 0 4px" }}>Not submitted</Typography.Title>
      <Typography.Text type="secondary">Your work has not been uploaded yet.</Typography.Text>

      {notOpenYet && (
        <Alert type="warning" showIcon title="This assignment is not open yet." style={{ marginTop: 12 }} />
      )}
      {!notOpenYet && pastDeadline && !config.allow_late && (
        <Alert type="error" showIcon title="The deadline has passed. Late submissions are not accepted." style={{ marginTop: 12 }} />
      )}
      {!notOpenYet && pastDeadline && config.allow_late && (
        <Alert type="warning" showIcon title="Past deadline — this will be marked Late." style={{ marginTop: 12 }} />
      )}

      {canSubmit && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept={allowedAccept}
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (maxBytes && file.size > maxBytes) {
                // message shown by Upload.Dragger below; handled there
                return;
              }
              onFileSelect(file);
              e.target.value = "";
            }}
          />
          <Upload.Dragger
            style={{ marginTop: 16 }}
            accept={allowedAccept}
            maxCount={1}
            showUploadList={false}
            beforeUpload={(file) => {
              if (maxBytes && file.size > maxBytes) {
                return Upload.LIST_IGNORE;
              }
              onFileSelect(file as unknown as File);
              return false;
            }}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Drop a file here or choose one</p>
            {(config.allowed_file_types?.length || config.max_file_size_mb) && (
              <p className="ant-upload-hint">
                {[
                  config.allowed_file_types?.length && config.allowed_file_types.join(", "),
                  config.max_file_size_mb && `up to ${config.max_file_size_mb} MB`,
                ].filter(Boolean).join(" · ")}
              </p>
            )}
          </Upload.Dragger>

          {selectedFile && (
            <div style={{ marginTop: 12 }}>
              <FileCard fileName={selectedFile.name} mimeType={selectedFile.type} sizeBytes={selectedFile.size} />
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button onClick={() => fileInputRef.current?.click()}>Choose file</Button>
            <Button
              type="primary"
              disabled={!selectedFile}
              loading={submitting}
              onClick={onSubmit}
            >
              Submit assignment
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function FileCard({ fileName, mimeType, sizeBytes }: { fileName: string; mimeType: string; sizeBytes: number }) {
  const kb = sizeBytes < 1024 * 1024
    ? `${(sizeBytes / 1024).toFixed(1)} KB`
    : `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid #d9d9d9", borderRadius: 6, background: "#fafafa" }}>
      <FileOutlined style={{ fontSize: 20, color: "#1677ff" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography.Text strong ellipsis style={{ display: "block" }}>{fileName}</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{mimeType} · {kb}</Typography.Text>
      </div>
    </div>
  );
}
