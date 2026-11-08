import { useEffect, useState } from "react";
import { Alert, App, Button, Card, Col, DatePicker, Empty, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Spin, Switch, Table, Tag, Tabs, Typography } from "antd";
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { normalizeApiError } from "@/api/apiError";
import TutorWorkspaceLayout from "../../../components/layout/TutorWorkspaceLayout";
import type { TutorQuestion, TutorQuizDetails } from "../quiz-types";
import { createTutorQuestion, createTutorQuiz, deleteTutorQuestion, getTutorAttempts, getTutorQuiz, updateTutorQuestion, updateTutorQuizActivity, updateTutorQuizSettings } from "../api/tutorQuizApi";

type SettingsForm = { title: string; description?: string; sequence_order: number; status: "PUBLISHED" | "HIDDEN"; time_limit_minutes: number; attempts_allowed: number; grading_method: "HIGHEST" | "AVERAGE" | "LAST"; opening_time?: Dayjs; deadline: Dayjs; required_score?: number };

export default function TutorQuizPage() {
  const { classId = "", activityId = "" } = useParams();
  const [params] = useSearchParams();
  const lessonId = params.get("lessonId") ?? "";
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [quiz, setQuiz] = useState<TutorQuizDetails>();
  const [attempts, setAttempts] = useState<Awaited<ReturnType<typeof getTutorAttempts>>>([]);
  const [loading, setLoading] = useState(Boolean(activityId));
  const [error, setError] = useState<string>();
  const [question, setQuestion] = useState<TutorQuestion>();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<SettingsForm>();

  useEffect(() => {
    if (!activityId) return;
    const controller = new AbortController();
    getTutorQuiz(activityId, controller.signal).then((value) => {
      setQuiz(value);
      form.setFieldsValue({
        title: value.title ?? "", description: value.description ?? "", sequence_order: 0, status: value.status ?? "HIDDEN",
        time_limit_minutes: value.time_limit_minutes, attempts_allowed: value.attempts_allowed, grading_method: value.grading_method,
        opening_time: value.opening_time ? dayjs(value.opening_time) : undefined, deadline: dayjs(value.deadline), required_score: value.required_score ?? undefined,
      });
    }).catch((cause: unknown) => { setError(normalizeApiError(cause).message); }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [activityId, form]);

  async function save(values: SettingsForm) {
    setSaving(true);
    try {
      if (!activityId) {
        if (!lessonId) throw new Error("A lesson is required to create a quiz.");
        const created = await createTutorQuiz(lessonId, {
          title: values.title, description: values.description, sequence_order: values.sequence_order, status: values.status,
          quiz: { time_limit_minutes: values.time_limit_minutes, attempts_allowed: values.attempts_allowed, grading_method: values.grading_method, opening_time: values.opening_time?.toISOString() ?? null, deadline: values.deadline.toISOString(), required_score: values.required_score ?? null },
        });
        message.success("Quiz created. Add questions before publishing.");
        navigate(`/tutor/classes/${classId}/content/quiz/${created.activity_id}`, { replace: true });
      } else {
        await Promise.all([
          updateTutorQuizActivity(activityId, { title: values.title, description: values.description, status: values.status }),
          updateTutorQuizSettings(activityId, { time_limit_minutes: values.time_limit_minutes, attempts_allowed: values.attempts_allowed, grading_method: values.grading_method, opening_time: values.opening_time?.toISOString() ?? null, deadline: values.deadline.toISOString(), required_score: values.required_score ?? null }),
        ]);
        message.success("Quiz settings saved.");
        setQuiz((current) => current ? { ...current, ...values, opening_time: values.opening_time?.toISOString() ?? null, deadline: values.deadline.toISOString(), required_score: values.required_score ?? null } : current);
      }
    } catch (cause) { message.error(normalizeApiError(cause).message); } finally { setSaving(false); }
  }

  async function saveQuestion(values: Omit<TutorQuestion, "question_id">) {
    if (!quiz) return;
    setSaving(true);
    try {
      if (question) await updateTutorQuestion(question.question_id, values);
      else await createTutorQuestion(quiz.activity_id, values);
      const refreshed = await getTutorQuiz(quiz.activity_id);
      setQuiz(refreshed); setQuestion(undefined); message.success(question ? "Question updated." : "Question added.");
    } catch (cause) { message.error(normalizeApiError(cause).message); } finally { setSaving(false); }
  }

  async function removeQuestion(questionId: string) {
    try { await deleteTutorQuestion(questionId); if (quiz) setQuiz(await getTutorQuiz(quiz.activity_id)); message.success("Question removed."); }
    catch (cause) { message.error(normalizeApiError(cause).message); }
  }

  async function loadAttempts() {
    if (!quiz) return;
    try { setAttempts(await getTutorAttempts(quiz.quiz_id)); } catch (cause) { message.error(normalizeApiError(cause).message); }
  }

  const isNew = !activityId;
  return (
    <TutorWorkspaceLayout currentPage="Quiz Editor">
      <main className="tutor-page" style={{ maxWidth: 1120, margin: "0 auto", padding: 32 }}>
        <Link to={`/tutor/classes/${classId}/content`}><ArrowLeftOutlined /> Back to Content Management</Link>
        <Typography.Title level={2}>{isNew ? "Create Quiz" : "Quiz Editor"}</Typography.Title>
        {error && <Alert type="error" showIcon title="Could not load quiz" description={error} />}
        {loading ? <div role="status"><Spin /> Loading quiz…</div> : (
          <Tabs items={[
            { key: "settings", label: "Settings", children: <SettingsFormView form={form} onFinish={save} saving={saving} isNew={isNew} /> },
            ...(!isNew ? [{ key: "questions", label: `Questions (${quiz?.questions.length ?? 0})`, children: <QuestionEditor quiz={quiz} onAdd={() => setQuestion({ question_id: "", question_type: "MCQ_SINGLE", content: "", points_awarded: 1, points_deducted: 0, order_index: quiz?.questions.length ?? 0, options: [{ option_id: "", content: "" }, { option_id: "", content: "" }] })} onEdit={setQuestion} onDelete={removeQuestion} /> }] : []),
            ...(!isNew ? [{ key: "attempts", label: "Attempts", children: <AttemptsPanel attempts={attempts} onLoad={loadAttempts} /> }] : []),
          ]} />
        )}
        <Modal open={Boolean(question)} title={question?.question_id ? "Edit Question" : "Add Question"} footer={null} onCancel={() => setQuestion(undefined)}>
          {question && <QuestionForm initial={question} onFinish={saveQuestion} saving={saving} />}
        </Modal>
      </main>
    </TutorWorkspaceLayout>
  );
}

function SettingsFormView({ form, onFinish, saving, isNew }: { form: ReturnType<typeof Form.useForm<SettingsForm>>[0]; onFinish: (values: SettingsForm) => void; saving: boolean; isNew: boolean }) {
  return <Card title={isNew ? "Create quiz activity" : "Quiz settings"}><Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ status: "HIDDEN", sequence_order: 0, time_limit_minutes: 20, attempts_allowed: 1, grading_method: "HIGHEST" }}>
    <Row gutter={16}><Col span={12}><Form.Item name="title" label="Title" rules={[{ required: true }]}><Input /></Form.Item></Col><Col span={12}><Form.Item name="sequence_order" label="Order" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col></Row>
    <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
    <Row gutter={16}><Col span={8}><Form.Item name="time_limit_minutes" label="Time limit (minutes)" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item></Col><Col span={8}><Form.Item name="attempts_allowed" label="Attempts allowed" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item></Col><Col span={8}><Form.Item name="grading_method" label="Grading"><Select options={["HIGHEST", "AVERAGE", "LAST"].map((value) => ({ value, label: value }))} /></Form.Item></Col></Row>
    <Row gutter={16}><Col span={12}><Form.Item name="opening_time" label="Opening time"><DatePicker showTime style={{ width: "100%" }} /></Form.Item></Col><Col span={12}><Form.Item name="deadline" label="Deadline" rules={[{ required: true }]}><DatePicker showTime style={{ width: "100%" }} /></Form.Item></Col></Row>
    <Row gutter={16}><Col span={12}><Form.Item name="required_score" label="Required score (%)"><InputNumber min={0} max={100} style={{ width: "100%" }} /></Form.Item></Col><Col span={12}><Form.Item name="status" label="Visibility" valuePropName="checked" getValueFromEvent={(checked: boolean) => checked ? "PUBLISHED" : "HIDDEN"} getValueProps={(value: string) => ({ checked: value === "PUBLISHED" })}><Switch checkedChildren="Published" unCheckedChildren="Hidden" /></Form.Item></Col></Row>
    <Button type="primary" htmlType="submit" loading={saving}>{isNew ? "Create Quiz" : "Save Settings"}</Button>
  </Form></Card>;
}

function QuestionEditor({ quiz, onAdd, onEdit, onDelete }: { quiz?: TutorQuizDetails; onAdd: () => void; onEdit: (question: TutorQuestion) => void; onDelete: (id: string) => void }) {
  if (!quiz) return <Empty description="Quiz not loaded." />;
  return <Card title="Questions" extra={<Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>Add Question</Button>}>{quiz.questions.length === 0 ? <Empty description="Add at least one valid question before publishing." /> : quiz.questions.map((item, index) => <Card.Grid key={item.question_id} style={{ width: "100%" }}><Typography.Text strong>Question {index + 1}</Typography.Text><Tag style={{ marginLeft: 8 }}>{item.question_type}</Tag><Typography.Paragraph>{item.content}</Typography.Paragraph><Button icon={<EditOutlined />} onClick={() => onEdit(item)}>Edit</Button> <Popconfirm title="Delete question?" onConfirm={() => onDelete(item.question_id)}><Button danger icon={<DeleteOutlined />}>Delete</Button></Popconfirm></Card.Grid>)}</Card>;
}

function QuestionForm({ initial, onFinish, saving }: { initial: TutorQuestion; onFinish: (values: Omit<TutorQuestion, "question_id">) => void; saving: boolean }) {
  const [form] = Form.useForm();
  return <Form form={form} layout="vertical" initialValues={initial} onFinish={(values) => onFinish({ ...values, options: values.options.map((option: { option_id?: string; content: string; is_correct?: boolean }, index: number) => ({ ...option, option_id: option.option_id ?? "", order_index: index })), order_index: values.order_index ?? initial.order_index, points_deducted: values.points_deducted ?? 0 })}><Form.Item name="question_type" label="Type" rules={[{ required: true }]}><Select options={["MCQ_SINGLE", "MCQ_MULTIPLE", "TRUE_FALSE"].map((value) => ({ value, label: value }))} /></Form.Item><Form.Item name="content" label="Question" rules={[{ required: true }]}><Input.TextArea /></Form.Item><Form.Item name="points_awarded" label="Points" rules={[{ required: true, type: "number", min: 0 }]}><InputNumber min={0} /></Form.Item><Form.List name="options">{(fields, { add, remove }) => <>{fields.map((field) => <Row key={field.key} gutter={8}><Col flex="auto"><Form.Item {...field} name={[field.name, "content"]} label={field.name === 0 ? "Options" : undefined} rules={[{ required: true }]}><Input /></Form.Item></Col><Col><Form.Item {...field} name={[field.name, "is_correct"]} valuePropName="checked" label={field.name === 0 ? "Correct" : undefined}><Switch /></Form.Item></Col><Col><Button danger onClick={() => remove(field.name)}>-</Button></Col></Row>)}<Button onClick={() => add({ content: "", is_correct: false })}>Add option</Button></>}</Form.List><Button type="primary" htmlType="submit" loading={saving}>Save Question</Button></Form>;
}

function AttemptsPanel({ attempts, onLoad }: { attempts: Awaited<ReturnType<typeof getTutorAttempts>>; onLoad: () => void }) {
  return <Card title="Attempts" extra={<Button onClick={onLoad}>Refresh</Button>}><Table rowKey="attempt_id" dataSource={attempts} pagination={false} columns={[{ title: "Student", dataIndex: "student_name", render: (value: string | undefined, item) => value ?? item.student_id ?? "Student" }, { title: "Status", dataIndex: "status" }, { title: "Attempt", dataIndex: "attempt_number" }, { title: "Score", dataIndex: "score", render: (value: number | null) => value == null ? "—" : `${value}%` }, { title: "Submitted", dataIndex: "submitted_at", render: (value: string | null) => value ? new Date(value).toLocaleString() : "In progress" }]} /></Card>;
}
