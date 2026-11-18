import { useEffect, useState } from "react";
import {
  Alert, App, Button, Card, Col, DatePicker, Form, Input, InputNumber,
  Popconfirm, Row, Select, Spin, Switch, Tabs, Tag, Typography, Upload,
} from "antd";
import { ArrowLeftOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { normalizeApiError } from "@/api/apiError";
import TutorWorkspaceLayout from "../../../components/layout/TutorWorkspaceLayout";
import {
  createTutorAssignment,
  deleteAssignmentAttachment,
  getTutorAssignment,
  updateTutorAssignmentActivity,
  updateTutorAssignmentSettings,
  uploadAssignmentAttachment,
  type TutorAssignmentAttachment,
  type TutorAssignmentDetails,
} from "../api/tutorAssignmentApi";

const SUPPORTED_FILE_TYPES = ["PDF", "DOCX", "PPTX", "TXT", "PNG", "JPG", "ZIP"];

type SettingsForm = {
  title: string;
  description?: string;
  sequence_order: number;
  status: "PUBLISHED" | "HIDDEN";
  opening_time?: Dayjs;
  deadline: Dayjs;
  allow_late: boolean;
  allowed_file_types: string[];
  max_file_size_mb?: number;
};

export default function TutorAssignmentPage() {
  const { classId = "", activityId = "" } = useParams();
  const [params] = useSearchParams();
  const lessonId = params.get("lessonId") ?? "";
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [assignment, setAssignment] = useState<TutorAssignmentDetails>();
  const [loading, setLoading] = useState(Boolean(activityId));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [uploadFile, setUploadFile] = useState<File>();
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [deletingAttachment, setDeletingAttachment] = useState<string>();
  const [form] = Form.useForm<SettingsForm>();

  useEffect(() => {
    if (!activityId) return;
    const controller = new AbortController();
    getTutorAssignment(activityId, controller.signal)
      .then((value) => {
        setAssignment(value);
        form.setFieldsValue({
          title: value.title ?? "",
          description: value.description ?? "",
          sequence_order: value.sequence_order ?? 0,
          status: value.status ?? "HIDDEN",
          opening_time: value.opening_time ? dayjs(value.opening_time) : undefined,
          deadline: dayjs(value.deadline),
          allow_late: value.allow_late,
          allowed_file_types: value.allowed_file_types ?? [],
          max_file_size_mb: value.max_file_size_mb ?? undefined,
        });
      })
      .catch((cause: unknown) => setError(normalizeApiError(cause).message))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [activityId, form]);

  async function save(values: SettingsForm) {
    setSaving(true);
    try {
      if (values.opening_time && values.opening_time.valueOf() >= values.deadline.valueOf()) {
        throw new Error("Opening time must be earlier than the deadline.");
      }
      const assignmentPayload = {
        opening_time: values.opening_time?.toISOString() ?? null,
        deadline: values.deadline.toISOString(),
        allow_late: values.allow_late,
        allowed_file_types: values.allowed_file_types?.length ? values.allowed_file_types : null,
        max_file_size_mb: values.max_file_size_mb ?? null,
      };
      if (!activityId) {
        if (!lessonId) throw new Error("A lesson is required to create an assignment.");
        const created = await createTutorAssignment(lessonId, {
          title: values.title,
          description: values.description,
          sequence_order: values.sequence_order,
          status: values.status,
          assignment: assignmentPayload,
        });
        message.success("Assignment created.");
        navigate(
          `/tutor/classes/${classId}/content/assignment/${created.activity_id}`,
          { replace: true },
        );
      } else {
        await Promise.all([
          updateTutorAssignmentActivity(activityId, {
            title: values.title,
            description: values.description,
            sequence_order: values.sequence_order,
            status: values.status,
          }),
          updateTutorAssignmentSettings(activityId, assignmentPayload),
        ]);
        message.success("Assignment settings saved.");
        setAssignment((current) =>
          current
            ? {
                ...current,
                title: values.title,
                description: values.description,
                sequence_order: values.sequence_order,
                status: values.status,
                ...assignmentPayload,
              }
            : current,
        );
      }
    } catch (cause: unknown) {
      message.error(normalizeApiError(cause).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadAttachment() {
    if (!assignment || !uploadFile) return;
    setUploadingAttachment(true);
    try {
      const att = await uploadAssignmentAttachment(assignment.assignment_id, uploadFile);
      setAssignment((current) =>
        current ? { ...current, attachments: [...current.attachments, att] } : current,
      );
      setUploadFile(undefined);
      message.success(`${att.file_name} uploaded.`);
    } catch (cause: unknown) {
      message.error(normalizeApiError(cause).message);
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function handleDeleteAttachment(att: TutorAssignmentAttachment) {
    setDeletingAttachment(att.attachment_id);
    try {
      await deleteAssignmentAttachment(att.attachment_id);
      setAssignment((current) =>
        current
          ? { ...current, attachments: current.attachments.filter((a) => a.attachment_id !== att.attachment_id) }
          : current,
      );
      message.success(`${att.file_name} removed.`);
    } catch (cause: unknown) {
      message.error(normalizeApiError(cause).message);
    } finally {
      setDeletingAttachment(undefined);
    }
  }

  const isNew = !activityId;
  return (
    <TutorWorkspaceLayout currentPage="Assignment Editor">
      <main className="tutor-page" style={{ maxWidth: 1120, margin: "0 auto", padding: 32 }}>
        <Link to={`/tutor/classes/${classId}/content`}>
          <ArrowLeftOutlined /> Back to Content Management
        </Link>
        <Typography.Title level={2} style={{ marginTop: 16 }}>
          {isNew ? "Create Assignment" : "Assignment Editor"}
        </Typography.Title>

        {error && <Alert type="error" showIcon title="Could not load assignment" description={error} style={{ marginBottom: 16 }} />}

        {loading ? (
          <div role="status"><Spin /> Loading assignment…</div>
        ) : (
          <Tabs
            items={[
              {
                key: "settings",
                label: "Settings",
                children: (
                  <SettingsFormView
                    form={form}
                    onFinish={save}
                    saving={saving}
                    isNew={isNew}
                  />
                ),
              },
              ...(!isNew
                ? [
                    {
                      key: "attachments",
                      label: `Reference Files (${assignment?.attachments.length ?? 0})`,
                      children: (
                        <AttachmentsPanel
                          attachments={assignment?.attachments ?? []}
                          uploadFile={uploadFile}
                          uploading={uploadingAttachment}
                          deletingId={deletingAttachment}
                          onFileSelect={setUploadFile}
                          onUpload={() => void handleUploadAttachment()}
                          onDelete={(att) => void handleDeleteAttachment(att)}
                        />
                      ),
                    },
                    {
                      key: "grade",
                      label: "Submissions & Grading",
                      children: assignment ? (
                        <div style={{ padding: "8px 0" }}>
                          <Button
                            type="primary"
                            icon={<ArrowLeftOutlined style={{ transform: "rotate(180deg)" }} />}
                          >
                            <Link to={`/tutor/classes/${classId}/content/assignment/${activityId}/grade`}>
                              Open Grading Screen
                            </Link>
                          </Button>
                          <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                            Review submissions and assign scores on the grading screen.
                          </Typography.Paragraph>
                        </div>
                      ) : null,
                    },
                  ]
                : []),
            ]}
          />
        )}
      </main>
    </TutorWorkspaceLayout>
  );
}

function SettingsFormView({
  form, onFinish, saving, isNew,
}: {
  form: ReturnType<typeof Form.useForm<SettingsForm>>[0];
  onFinish: (values: SettingsForm) => void;
  saving: boolean;
  isNew: boolean;
}) {
  return (
    <Card title={isNew ? "Create assignment activity" : "Assignment settings"}>
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          status: "HIDDEN",
          sequence_order: 0,
          allow_late: false,
          allowed_file_types: [],
        }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="title" label="Title" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="sequence_order" label="Order" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="description" label="Instructions">
          <Input.TextArea rows={4} placeholder="Describe what students should submit…" />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="opening_time" label="Opening time">
              <DatePicker showTime style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="deadline" label="Deadline" rules={[{ required: true }]}>
              <DatePicker showTime style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="allowed_file_types" label="Allowed file types">
              <Select
                mode="multiple"
                placeholder="Any type if empty"
                options={SUPPORTED_FILE_TYPES.map((t) => ({ value: t, label: t }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="max_file_size_mb" label="Max file size (MB)">
              <InputNumber min={1} style={{ width: "100%" }} placeholder="No limit" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="allow_late"
              label="Allow late submissions"
              valuePropName="checked"
            >
              <Switch checkedChildren="Allowed" unCheckedChildren="Not allowed" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="status"
              label="Visibility"
              valuePropName="checked"
              getValueFromEvent={(checked: boolean) => (checked ? "PUBLISHED" : "HIDDEN")}
              getValueProps={(value: string) => ({ checked: value === "PUBLISHED" })}
            >
              <Switch checkedChildren="Published" unCheckedChildren="Hidden" />
            </Form.Item>
          </Col>
        </Row>

        <Button type="primary" htmlType="submit" loading={saving}>
          {isNew ? "Create Assignment" : "Save Settings"}
        </Button>
      </Form>
    </Card>
  );
}

function AttachmentsPanel({
  attachments, uploadFile, uploading, deletingId, onFileSelect, onUpload, onDelete,
}: {
  attachments: TutorAssignmentAttachment[];
  uploadFile: File | undefined;
  uploading: boolean;
  deletingId: string | undefined;
  onFileSelect: (file: File) => void;
  onUpload: () => void;
  onDelete: (att: TutorAssignmentAttachment) => void;
}) {
  return (
    <Card
      title="Reference attachments"
      extra={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Upload
            maxCount={1}
            showUploadList={false}
            beforeUpload={(file) => { onFileSelect(file as unknown as File); return false; }}
          >
            <Button icon={<PlusOutlined />}>Choose file</Button>
          </Upload>
          <Button
            type="primary"
            disabled={!uploadFile}
            loading={uploading}
            onClick={onUpload}
          >
            Upload
          </Button>
        </div>
      }
    >
      {uploadFile && (
        <Alert
          title={`Ready to upload: ${uploadFile.name} (${(uploadFile.size / 1024).toFixed(0)} KB)`}
          type="info"
          style={{ marginBottom: 12 }}
        />
      )}
      {attachments.length === 0 ? (
        <Typography.Text type="secondary">No reference files yet.</Typography.Text>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {attachments.map((att) => (
            <div
              key={att.attachment_id}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", border: "1px solid #d9d9d9", borderRadius: 6 }}
            >
              <div style={{ flex: 1 }}>
                <Typography.Text strong>{att.file_name}</Typography.Text>
                <Tag style={{ marginLeft: 8 }}>{att.mime_type}</Tag>
                <Typography.Text type="secondary" style={{ marginLeft: 4, fontSize: 12 }}>
                  {(att.size_bytes / 1024).toFixed(0)} KB
                </Typography.Text>
              </div>
              <Popconfirm
                title="Delete this attachment?"
                onConfirm={() => onDelete(att)}
              >
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  loading={deletingId === att.attachment_id}
                />
              </Popconfirm>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
