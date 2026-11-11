import { useEffect, useState } from "react";
import { Alert, App, Button, Card, Col, DatePicker, Empty, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Spin, Switch, Table, Tag, Tabs, Typography } from "antd";
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { normalizeApiError } from "@/api/apiError";
import TutorWorkspaceLayout from "../../../components/layout/TutorWorkspaceLayout";
import type { TutorOption, TutorQuestion, TutorQuizDetails } from "../quiz-types";
import { validateTutorQuestion } from "../quizValidation";
import { createTutorQuestion, createTutorQuiz, deleteTutorQuestion, getTutorAttempts, getTutorQuiz, updateTutorQuestion, updateTutorQuizActivity, updateTutorQuizSettings } from "../api/tutorQuizApi";

type SettingsForm = { title: string; description?: string; sequence_order: number; status: "PUBLISHED" | "HIDDEN"; time_limit_minutes: number; attempts_allowed: number; grading_method: "HIGHEST" | "AVERAGE" | "LAST"; opening_time?: Dayjs; deadline: Dayjs; required_score?: number };

function LockBanner({ quiz, onHide }: { quiz?: TutorQuizDetails; onHide: () => void }) {
  return quiz?.attempts_exist ? <Alert type="warning" showIcon message="This quiz is locked for restricted edits because students have attempted it." description="Hide the quiz instead of deleting questions or changing grading-sensitive data." action={<Button size="small" onClick={onHide}>Hide quiz</Button>} style={{ marginBottom: 16 }} /> : null;
}

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
  const [lockMessage, setLockMessage] = useState<string>();
  const [lockCheckFailed, setLockCheckFailed] = useState(false);
  const [form] = Form.useForm<SettingsForm>();

  useEffect(() => {
    if (!activityId) return;
    const controller = new AbortController();
    getTutorQuiz(activityId, controller.signal).then(async (value) => {
      setQuiz(value);
      try {
        const existingAttempts = await getTutorAttempts(value.quiz_id, controller.signal);
        if (existingAttempts.length) {
          value.attempts_exist = true;
          setAttempts(existingAttempts);
        }
      } catch (cause) {
        value.attempts_exist = true;
        setQuiz(value);
        setLockCheckFailed(true);
        setError(`Unable to verify whether this quiz has attempts. Editing is locked until the attempt history can be loaded. ${normalizeApiError(cause).message}`);
        setLoading(false);
        return;
      }
      form.setFieldsValue({
        title: value.title ?? "", description: value.description ?? "", sequence_order: value.sequence_order ?? 0, status: value.status ?? "HIDDEN",
        time_limit_minutes: value.time_limit_minutes, attempts_allowed: value.attempts_allowed, grading_method: value.grading_method,
        opening_time: value.opening_time ? dayjs(value.opening_time) : undefined, deadline: dayjs(value.deadline), required_score: value.required_score ?? undefined,
      });
    }).catch((cause: unknown) => { setError(normalizeApiError(cause).message); }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [activityId, form]);

  async function save(values: SettingsForm) {
    setSaving(true);
    try {
      if (values.opening_time && values.opening_time.valueOf() >= values.deadline.valueOf()) throw new Error("Opening time must be earlier than the deadline.");
      if (values.status === "PUBLISHED" && (!quiz || quiz.questions.length === 0 || quiz.questions.some((item) => validateTutorQuestion(item)))) throw new Error("Publishing requires at least one valid question.");
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
          updateTutorQuizActivity(activityId, { title: values.title, description: values.description, sequence_order: values.sequence_order, status: values.status }),
          updateTutorQuizSettings(activityId, { time_limit_minutes: values.time_limit_minutes, attempts_allowed: values.attempts_allowed, grading_method: values.grading_method, opening_time: values.opening_time?.toISOString() ?? null, deadline: values.deadline.toISOString(), required_score: values.required_score ?? null }),
        ]);
        message.success("Quiz settings saved.");
        setQuiz((current) => current ? { ...current, ...values, sequence_order: values.sequence_order, opening_time: values.opening_time?.toISOString() ?? null, deadline: values.deadline.toISOString(), required_score: values.required_score ?? null } : current);
      }
    } catch (cause) {
      const failure = normalizeApiError(cause);
      if (failure.code === "QUIZ_ALREADY_ATTEMPTED_RESTRICTED_EDIT") {
        setLockMessage("Restricted settings cannot be changed after students attempt this quiz.");
        message.error("Restricted settings cannot be changed after students attempt this quiz. Hide the quiz instead.");
      } else message.error(failure.message);
    } finally { setSaving(false); }
  }

  async function saveQuestion(values: Omit<TutorQuestion, "question_id">) {
    if (!quiz) return;
    setSaving(true);
    try {
      if (question) await updateTutorQuestion(question.question_id, values);
      else await createTutorQuestion(quiz.activity_id, values);
      const refreshed = await getTutorQuiz(quiz.activity_id);
      setQuiz(refreshed); setQuestion(undefined); message.success(question ? "Question updated." : "Question added.");
    } catch (cause) {
      const failure = normalizeApiError(cause);
      if (failure.code === "QUESTION_EDIT_LOCKED") {
        setLockMessage("This question cannot be changed because students have attempted it.");
        message.error("This question cannot be changed because students have attempted it. Hide the quiz instead.");
      } else message.error(failure.message);
    } finally { setSaving(false); }
  }

  async function removeQuestion(questionId: string) {
    try {
      if (quiz?.attempts_exist) {
        await updateTutorQuizActivity(quiz.activity_id, { status: "HIDDEN" });
        message.info("Students have attempted this quiz, so it was hidden instead of deleting the question.");
      } else {
        await deleteTutorQuestion(questionId);
        message.success("Question removed.");
      }
      if (quiz) setQuiz(await getTutorQuiz(quiz.activity_id));
    } catch (cause) {
      const failure = normalizeApiError(cause);
      if (failure.code === "QUESTION_EDIT_LOCKED") {
        setLockMessage("This question cannot be deleted because students have attempted it.");
        message.error("This question cannot be deleted because students have attempted it. Hide the quiz instead.");
      } else message.error(failure.message);
    }
  }

  async function loadAttempts() {
    if (!quiz) return;
    try { setAttempts(await getTutorAttempts(quiz.quiz_id)); } catch (cause) { message.error(normalizeApiError(cause).message); }
  }

  async function hideQuiz() {
    if (!quiz) return;
    try {
      await updateTutorQuizActivity(quiz.activity_id, { status: "HIDDEN" });
      setQuiz({ ...quiz, status: "HIDDEN" });
      setLockMessage(undefined);
      message.success("Quiz hidden from students.");
    } catch (cause) {
      message.error(normalizeApiError(cause).message);
    }
  }

  const isNew = !activityId;
  return (
    <TutorWorkspaceLayout currentPage="Quiz Editor">
      <main className="tutor-page" style={{ maxWidth: 1120, margin: "0 auto", padding: 32 }}>
        <Link to={`/tutor/classes/${classId}/content`}><ArrowLeftOutlined /> Back to Content Management</Link>
        <Typography.Title level={2}>{isNew ? "Create Quiz" : "Quiz Editor"}</Typography.Title>
        {error && <Alert type="error" showIcon title="Could not load quiz" description={error} />}
        {loading ? <div role="status"><Spin /> Loading quiz…</div> : lockCheckFailed ? (
          <Alert type="warning" showIcon title="Quiz editing is locked" description={error} />
        ) : (
          <Tabs items={[
            { key: "settings", label: "Settings", children: <><LockBanner quiz={quiz} onHide={() => void hideQuiz()} />{lockMessage && <Alert type="warning" showIcon message={lockMessage} action={<Button size="small" onClick={() => void hideQuiz()}>Hide quiz</Button>} style={{ marginBottom: 16 }} />}<SettingsFormView form={form} onFinish={save} saving={saving} isNew={isNew} /></> },
            ...(!isNew ? [{ key: "questions", label: `Questions (${quiz?.questions.length ?? 0})`, children: <><LockBanner quiz={quiz} onHide={() => void hideQuiz()} /><QuestionEditor quiz={quiz} onAdd={() => setQuestion({ question_id: "", question_type: "MCQ_SINGLE", content: "", points_awarded: 1, points_deducted: 0, order_index: quiz?.questions.length ?? 0, options: [{ option_id: "", content: "", is_correct: false, order_index: 0 }, { option_id: "", content: "", is_correct: false, order_index: 1 }] })} onEdit={setQuestion} onDelete={removeQuestion} /> </> }] : []),
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
  return <Card title="Questions" extra={<Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>Add Question</Button>}>{quiz.questions.length === 0 ? <Empty description="Add at least one valid question before publishing." /> : quiz.questions.map((item, index) => <Card.Grid key={item.question_id} style={{ width: "100%" }}><Typography.Text strong>Question {index + 1}</Typography.Text><Tag style={{ marginLeft: 8 }}>{item.question_type}</Tag><Typography.Paragraph>{item.content}</Typography.Paragraph><Button icon={<EditOutlined />} onClick={() => onEdit(item)}>Edit</Button> <Popconfirm title="Delete question?" onConfirm={() => onDelete(item.question_id)}><Button danger icon={<DeleteOutlined />}>{quiz.attempts_exist ? "Hide quiz" : "Delete"}</Button></Popconfirm></Card.Grid>)}</Card>;
}

function QuestionForm({ initial, onFinish, saving }: { initial: TutorQuestion; onFinish: (values: Omit<TutorQuestion, "question_id">) => void; saving: boolean }) {
  const [form] = Form.useForm();
  function finish(values: { question_type: TutorQuestion["question_type"]; options: TutorOption[]; [key: string]: unknown }) {
    const options = values.options ?? [];
    const validation = validateTutorQuestion({ ...initial, ...values, options } as TutorQuestion);
    if (validation) {
      form.setFields([{ name: "options", errors: [validation] }]);
      return;
    }
    onFinish({ ...values, options: options.map((option, index) => ({ ...option, option_id: option.option_id ?? "", order_index: index })), order_index: Number(values.order_index ?? initial.order_index), points_awarded: Number(values.points_awarded), points_deducted: Number(values.points_deducted ?? 0) } as Omit<TutorQuestion, "question_id">);
  }
  return <Form form={form} layout="vertical" initialValues={initial} onFinish={finish}><Form.Item name="question_type" label="Type" rules={[{ required: true }]}><Select options={["MCQ_SINGLE", "MCQ_MULTIPLE", "TRUE_FALSE"].map((value) => ({ value, label: value }))} /></Form.Item><Form.Item name="content" label="Question" rules={[{ required: true }, { validator: (_, value) => value?.trim() ? Promise.resolve() : Promise.reject(new Error("Question content cannot be blank.")) }]}><Input.TextArea /></Form.Item><Form.Item name="points_awarded" label="Points" rules={[{ required: true, type: "number", min: 0 }]}><InputNumber min={0} /></Form.Item><Form.List name="options">{(fields, { add, remove }) => <>{fields.map((field) => <Row key={field.key} gutter={8}><Col flex="auto"><Form.Item {...field} name={[field.name, "content"]} label={field.name === 0 ? "Options" : undefined} rules={[{ required: true }, { validator: (_, value) => value?.trim() ? Promise.resolve() : Promise.reject(new Error("Option cannot be blank.")) }]}><Input /></Form.Item></Col><Col><Form.Item {...field} name={[field.name, "is_correct"]} valuePropName="checked" label={field.name === 0 ? "Correct" : undefined}><Switch /></Form.Item></Col><Col><Button danger onClick={() => remove(field.name)}>-</Button></Col></Row>)}<Button onClick={() => add({ content: "", is_correct: false })}>Add option</Button></>}</Form.List><Button type="primary" htmlType="submit" loading={saving}>Save Question</Button></Form>;
}

function AttemptsPanel({ attempts, onLoad }: { attempts: Awaited<ReturnType<typeof getTutorAttempts>>; onLoad: () => void }) {
  return <Card title="Attempts" extra={<Button onClick={onLoad}>Refresh</Button>}><Table rowKey="attempt_id" dataSource={attempts} pagination={false} columns={[
    { title: "Student", dataIndex: "student_name", render: (value: string | undefined, item) => value ?? item.student_id ?? "Student" },
    { title: "Status", dataIndex: "status" },
    { title: "Attempt", dataIndex: "attempt_number" },
    { title: "Started", dataIndex: "started_at", render: (value: string) => new Date(value).toLocaleString() },
    { title: "Duration", render: (_, item) => item.submitted_at ? `${Math.max(0, Math.round((new Date(item.submitted_at).getTime() - new Date(item.started_at).getTime()) / 60000))} min` : "In progress" },
    { title: "Score", dataIndex: "score", render: (value: number | null) => value == null ? "—" : `${value}%` },
    { title: "Pass", dataIndex: "passed", render: (value: boolean | null) => value == null ? "—" : value ? "Passed" : "Not passed" },
    { title: "Submitted", dataIndex: "submitted_at", render: (value: string | null, item) => value ? new Date(value).toLocaleString() : item.auto_submitted ? "Auto-submitted" : "In progress" },
  ]} /></Card>;
}
