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
  return quiz?.attempts_exist ? <Alert type="warning" showIcon message="This quiz is locked for restricted edits because students have attempted it." description="Adding or deleting questions, changing question types, and removing existing options are blocked. Hide the quiz instead." action={<Button size="small" onClick={onHide}>Hide quiz</Button>} style={{ marginBottom: 16 }} /> : null;
}

export default function TutorQuizPage() {
  const { classId = "", activityId = "" } = useParams();
  const [params] = useSearchParams();
  const lessonId = params.get("lessonId") ?? "";
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [quiz, setQuiz] = useState<TutorQuizDetails>();
  const [attempts, setAttempts] = useState<Awaited<ReturnType<typeof getTutorAttempts>>>([]);
  const [loadedActivityId, setLoadedActivityId] = useState<string>("");
  const [error, setError] = useState<string>();
  const [question, setQuestion] = useState<TutorQuestion>();
  const [saving, setSaving] = useState(false);
  const [lockMessage, setLockMessage] = useState<string>();
  const [lockCheckFailed, setLockCheckFailed] = useState(false);
  const [form] = Form.useForm<SettingsForm>();
  const loading = Boolean(activityId) && loadedActivityId !== activityId;

  useEffect(() => {
    if (!activityId) return;
    const controller = new AbortController();
    getTutorQuiz(activityId, controller.signal).then(async (value) => {
      if (controller.signal.aborted) return;
      try {
        const existingAttempts = await getTutorAttempts(value.quiz_id, controller.signal);
        if (controller.signal.aborted) return;
        const loaded: TutorQuizDetails = { ...value, attempts_exist: existingAttempts.length > 0 };
        setError(undefined);
        setLockCheckFailed(false);
        setQuiz(loaded);
        setAttempts(existingAttempts);
        form.setFieldsValue({
          title: loaded.title,
          description: loaded.description ?? "",
          sequence_order: loaded.sequence_order,
          status: loaded.status,
          time_limit_minutes: loaded.time_limit_minutes,
          attempts_allowed: loaded.attempts_allowed,
          grading_method: loaded.grading_method,
          opening_time: loaded.opening_time ? dayjs(loaded.opening_time) : undefined,
          deadline: dayjs(loaded.deadline),
          required_score: loaded.required_score ?? undefined,
        });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setQuiz({ ...value, attempts_exist: true });
        setLockCheckFailed(true);
        setError(`Unable to verify whether this quiz has attempts. Editing is locked until the attempt history can be loaded. ${normalizeApiError(cause).message}`);
      }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(normalizeApiError(cause).message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoadedActivityId(activityId);
    });
    return () => controller.abort();
  }, [activityId, form]);

  async function reloadQuiz(targetActivityId: string, preserveAttemptsExist: boolean) {
    const refreshed = await getTutorQuiz(targetActivityId);
    const merged: TutorQuizDetails = { ...refreshed, attempts_exist: preserveAttemptsExist };
    setQuiz(merged);
    form.setFieldsValue({
      title: merged.title,
      description: merged.description ?? "",
      sequence_order: merged.sequence_order,
      status: merged.status,
      time_limit_minutes: merged.time_limit_minutes,
      attempts_allowed: merged.attempts_allowed,
      grading_method: merged.grading_method,
      opening_time: merged.opening_time ? dayjs(merged.opening_time) : undefined,
      deadline: dayjs(merged.deadline),
      required_score: merged.required_score ?? undefined,
    });
  }

  async function save(values: SettingsForm) {
    setSaving(true);
    try {
      if (values.opening_time && values.opening_time.valueOf() >= values.deadline.valueOf()) throw new Error("Opening time must be earlier than the deadline.");
      if (values.status === "PUBLISHED" && (!quiz || quiz.questions.length === 0 || quiz.questions.some((item) => validateTutorQuestion(item)))) throw new Error("Publishing requires at least one valid question.");
      if (!activityId) {
        if (!lessonId) throw new Error("A lesson is required to create a quiz.");
        const created = await createTutorQuiz(lessonId, {
          title: values.title,
          description: values.description,
          sequence_order: values.sequence_order,
          status: values.status,
          quiz: {
            time_limit_minutes: values.time_limit_minutes,
            attempts_allowed: values.attempts_allowed,
            grading_method: values.grading_method,
            opening_time: values.opening_time?.toISOString() ?? null,
            deadline: values.deadline.toISOString(),
            required_score: values.required_score ?? null,
          },
        });
        message.success("Quiz created. Add questions before publishing.");
        navigate(`/tutor/classes/${classId}/content/quiz/${created.activity_id}`, { replace: true });
      } else {
        const nextOpening = values.opening_time?.toISOString() ?? null;
        const nextDeadline = values.deadline.toISOString();
        const deadlineChanged = !quiz || dayjs(quiz.deadline).valueOf() !== values.deadline.valueOf();
        await updateTutorQuizSettings(activityId, {
          time_limit_minutes: values.time_limit_minutes,
          attempts_allowed: values.attempts_allowed,
          grading_method: values.grading_method,
          opening_time: nextOpening,
          ...(deadlineChanged ? { deadline: nextDeadline } : {}),
          required_score: values.required_score ?? null,
        });
        await updateTutorQuizActivity(activityId, {
          title: values.title,
          description: values.description,
          sequence_order: values.sequence_order,
          status: values.status,
        });
        message.success("Quiz settings saved.");
        setQuiz((current) => current ? {
          ...current,
          title: values.title,
          description: values.description ?? null,
          sequence_order: values.sequence_order,
          status: values.status,
          time_limit_minutes: values.time_limit_minutes,
          attempts_allowed: values.attempts_allowed,
          grading_method: values.grading_method,
          opening_time: nextOpening,
          deadline: deadlineChanged ? nextDeadline : current.deadline,
          required_score: values.required_score ?? null,
        } : current);
      }
    } catch (cause) {
      const failure = normalizeApiError(cause);
      if (failure.code === "QUIZ_ALREADY_ATTEMPTED_RESTRICTED_EDIT") {
        setLockMessage("Restricted settings cannot be changed after students attempt this quiz.");
        message.error("Restricted settings cannot be changed after students attempt this quiz. Hide the quiz instead.");
      } else if (failure.code === "ASSESSMENT_CONFIGURATION_MISMATCH") {
        message.error("Publishing requires at least one valid question.");
      } else message.error(failure.message);
    } finally { setSaving(false); }
  }

  async function saveQuestion(values: Omit<TutorQuestion, "question_id">) {
    if (!quiz) return;
    setSaving(true);
    try {
      const isEditing = Boolean(question?.question_id);
      if (isEditing && question) {
        await updateTutorQuestion(question.question_id, {
          ...(quiz.attempts_exist ? {} : { question_type: values.question_type }),
          content: values.content,
          points_awarded: values.points_awarded,
          points_deducted: values.points_deducted,
          order_index: values.order_index,
          options: values.options.map((option) => ({
            ...(option.option_id ? { option_id: option.option_id } : {}),
            content: option.content,
            is_correct: option.is_correct,
            order_index: option.order_index,
          })),
        });
      } else {
        await createTutorQuestion(quiz.activity_id, {
          question_type: values.question_type,
          content: values.content,
          points_awarded: values.points_awarded,
          points_deducted: values.points_deducted,
          order_index: values.order_index,
          options: values.options.map((option) => ({
            content: option.content,
            is_correct: option.is_correct,
            order_index: option.order_index,
          })),
        });
      }
      await reloadQuiz(quiz.activity_id, Boolean(quiz.attempts_exist));
      setQuestion(undefined);
      message.success(isEditing ? "Question updated." : "Question added.");
    } catch (cause) {
      const failure = normalizeApiError(cause);
      if (failure.code === "QUESTION_EDIT_LOCKED") {
        setLockMessage("This question cannot be changed because students have attempted it.");
        message.error("This question cannot be changed because students have attempted it. Hide the quiz instead.");
      } else message.error(failure.message);
    } finally { setSaving(false); }
  }

  async function removeQuestion(questionId: string) {
    if (!quiz) return;
    try {
      if (quiz.attempts_exist) {
        await updateTutorQuizActivity(quiz.activity_id, { status: "HIDDEN" });
        message.info("Students have attempted this quiz, so it was hidden instead of deleting the question.");
      } else {
        await deleteTutorQuestion(questionId);
        message.success("Question removed.");
      }
      await reloadQuiz(quiz.activity_id, Boolean(quiz.attempts_exist));
    } catch (cause) {
      const failure = normalizeApiError(cause);
      if (failure.code === "QUESTION_EDIT_LOCKED") {
        setLockMessage("This question cannot be deleted because students have attempted it.");
        message.error("This question cannot be deleted because students have attempted it. Hide the quiz instead.");
      } else if (failure.code === "ASSESSMENT_CONFIGURATION_MISMATCH") {
        message.error("Cannot delete the last question of a published quiz. Hide the quiz first.");
      } else message.error(failure.message);
    }
  }

  async function loadAttempts() {
    if (!quiz) return;
    try {
      const latest = await getTutorAttempts(quiz.quiz_id);
      setAttempts(latest);
      if (latest.length > 0 && !quiz.attempts_exist) {
        setQuiz((current) => current ? { ...current, attempts_exist: true } : current);
      }
    } catch (cause) { message.error(normalizeApiError(cause).message); }
  }

  async function hideQuiz() {
    if (!quiz) return;
    try {
      await updateTutorQuizActivity(quiz.activity_id, { status: "HIDDEN" });
      setQuiz({ ...quiz, status: "HIDDEN" });
      form.setFieldValue("status", "HIDDEN");
      setLockMessage(undefined);
      message.success("Quiz hidden from students.");
    } catch (cause) {
      message.error(normalizeApiError(cause).message);
    }
  }

  const nextQuestionOrder = quiz && quiz.questions.length > 0
    ? Math.max(...quiz.questions.map((item) => item.order_index)) + 1
    : 0;
  const isNew = !activityId;
  return (
    <TutorWorkspaceLayout currentPage="Quiz Editor">
      <main className="tutor-page" style={{ maxWidth: 1120, margin: "0 auto", padding: 32 }}>
        <Link to={`/tutor/classes/${classId}/content`}><ArrowLeftOutlined /> Back to Content Management</Link>
        <Typography.Title level={2}>{isNew ? "Create Quiz" : "Quiz Editor"}</Typography.Title>
        {error && <Alert type="error" showIcon title="Could not load quiz" description={error} />}
        {loading ? <div role="status"><Spin /> Loading quiz…</div> : lockCheckFailed ? (
          <Alert type="warning" showIcon title="Quiz editing is locked" description={error} />
        ) : !isNew && !quiz ? null : (
          <Tabs items={[
            { key: "settings", label: "Settings", children: <><LockBanner quiz={quiz} onHide={() => void hideQuiz()} />{lockMessage && <Alert type="warning" showIcon message={lockMessage} action={<Button size="small" onClick={() => void hideQuiz()}>Hide quiz</Button>} style={{ marginBottom: 16 }} />}<SettingsFormView form={form} onFinish={save} saving={saving} isNew={isNew} /></> },
            ...(!isNew ? [{ key: "questions", label: `Questions (${quiz?.questions.length ?? 0})`, children: <><LockBanner quiz={quiz} onHide={() => void hideQuiz()} /><QuestionEditor quiz={quiz} onAdd={() => setQuestion({ question_id: "", question_type: "MCQ_SINGLE", content: "", points_awarded: 1, points_deducted: 0, order_index: nextQuestionOrder, options: [{ option_id: "", content: "", is_correct: false, order_index: 0 }, { option_id: "", content: "", is_correct: false, order_index: 1 }] })} onEdit={setQuestion} onDelete={removeQuestion} /> </> }] : []),
            ...(!isNew ? [{ key: "attempts", label: "Attempts", children: <AttemptsPanel attempts={attempts} onLoad={loadAttempts} /> }] : []),
          ]} />
        )}
        <Modal open={Boolean(question)} title={question?.question_id ? "Edit Question" : "Add Question"} footer={null} onCancel={() => setQuestion(undefined)}>
          {question && <QuestionForm key={question.question_id || "new"} initial={question} attemptsExist={Boolean(quiz?.attempts_exist)} onFinish={saveQuestion} saving={saving} />}
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
  return <Card title="Questions" extra={<Button type="primary" icon={<PlusOutlined />} disabled={Boolean(quiz.attempts_exist)} onClick={onAdd}>Add Question</Button>}>{quiz.questions.length === 0 ? <Empty description="Add at least one valid question before publishing." /> : quiz.questions.map((item, index) => <Card.Grid key={item.question_id} style={{ width: "100%" }}><Typography.Text strong>Question {index + 1}</Typography.Text><Tag style={{ marginLeft: 8 }}>{item.question_type}</Tag><Typography.Paragraph>{item.content}</Typography.Paragraph><Button icon={<EditOutlined />} onClick={() => onEdit(item)}>Edit</Button> <Popconfirm title={quiz.attempts_exist ? "Hide quiz instead of deleting?" : "Delete question?"} onConfirm={() => onDelete(item.question_id)}><Button danger icon={<DeleteOutlined />}>{quiz.attempts_exist ? "Hide quiz" : "Delete"}</Button></Popconfirm></Card.Grid>)}</Card>;
}

function QuestionForm({ initial, attemptsExist, onFinish, saving }: { initial: TutorQuestion; attemptsExist: boolean; onFinish: (values: Omit<TutorQuestion, "question_id">) => void; saving: boolean }) {
  const [form] = Form.useForm();
  const isEditing = Boolean(initial.question_id);
  function finish(values: { question_type: TutorQuestion["question_type"]; options: TutorOption[]; [key: string]: unknown }) {
    const options = values.options ?? [];
    const validation = validateTutorQuestion({ ...initial, ...values, options } as TutorQuestion);
    if (validation) {
      form.setFields([{ name: "options", errors: [validation] }]);
      return;
    }
    onFinish({
      ...values,
      options: options.map((option, index) => ({
        ...option,
        option_id: option.option_id ?? "",
        order_index: index,
      })),
      order_index: Number(values.order_index ?? initial.order_index),
      points_awarded: Number(values.points_awarded),
      points_deducted: Number(values.points_deducted ?? 0),
    } as Omit<TutorQuestion, "question_id">);
  }
  return <Form form={form} layout="vertical" initialValues={initial} onFinish={finish}>
    <Form.Item name="question_type" label="Type" rules={[{ required: true }]}>
      <Select disabled={isEditing && attemptsExist} options={["MCQ_SINGLE", "MCQ_MULTIPLE", "TRUE_FALSE"].map((value) => ({ value, label: value }))} />
    </Form.Item>
    <Form.Item name="content" label="Question" rules={[{ required: true }, { validator: (_, value) => value?.trim() ? Promise.resolve() : Promise.reject(new Error("Question content cannot be blank.")) }]}>
      <Input.TextArea />
    </Form.Item>
    <Row gutter={16}>
      <Col span={12}><Form.Item name="points_awarded" label="Points awarded" rules={[{ required: true, type: "number", min: 0 }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
      <Col span={12}><Form.Item name="points_deducted" label="Points deducted" rules={[{ type: "number", min: 0 }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
    </Row>
    <Form.List name="options">{(fields, { add, remove }) => <>
      {fields.map((field) => {
        const optionId = form.getFieldValue(["options", field.name, "option_id"]) as string | undefined;
        const removeBlocked = isEditing && attemptsExist && Boolean(optionId);
        return <Row key={field.key} gutter={8}>
          <Col flex="auto">
            <Form.Item {...field} name={[field.name, "content"]} label={field.name === 0 ? "Options" : undefined} rules={[{ required: true }, { validator: (_, value) => value?.trim() ? Promise.resolve() : Promise.reject(new Error("Option cannot be blank.")) }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col>
            <Form.Item {...field} name={[field.name, "is_correct"]} valuePropName="checked" label={field.name === 0 ? "Correct" : undefined}>
              <Switch />
            </Form.Item>
          </Col>
          <Col>
            <Button danger disabled={removeBlocked} onClick={() => remove(field.name)}>-</Button>
          </Col>
        </Row>;
      })}
      <Button onClick={() => add({ content: "", is_correct: false })}>Add option</Button>
    </>}</Form.List>
    <Button type="primary" htmlType="submit" loading={saving} style={{ marginTop: 12 }}>Save Question</Button>
  </Form>;
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
