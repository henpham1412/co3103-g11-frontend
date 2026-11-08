import { useEffect, useState } from "react";
import { Alert, App, Button, Card, Checkbox, Col, Empty, Modal, Progress, Radio, Row, Spin, Tag, Typography } from "antd";
import { ArrowLeftOutlined, CheckCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { Link, useParams } from "react-router-dom";
import { normalizeApiError } from "@/api/apiError";
import StudentWorkspaceLayout from "../../../components/layout/StudentWorkspaceLayout";
import {
  clearQuizAnswer,
  getQuizSettings,
  saveQuizAnswer,
  startOrResumeQuiz,
  submitQuizAttempt,
} from "../api/quizApi";
import type { QuizAttempt, QuizQuestion, QuizSettings, QuizSubmitResult } from "../quiz-types";

type View = "overview" | "workspace" | "submitted";

export default function QuizActivityPage() {
  const { classId = "", activityId = "" } = useParams();
  const [settings, setSettings] = useState<QuizSettings>();
  const [attempt, setAttempt] = useState<QuizAttempt>();
  const [result, setResult] = useState<QuizSubmitResult>();
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; text: string }>();

  useEffect(() => {
    const controller = new AbortController();
    getQuizSettings(activityId, controller.signal)
      .then(setSettings)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          const failure = normalizeApiError(cause);
          setError({ status: failure.status, text: failure.message });
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activityId]);

  async function beginAttempt() {
    if (!settings) return;
    setError(undefined);
    try {
      const next = await startOrResumeQuiz(settings.quiz_id);
      setAttempt(next);
      setView("workspace");
    } catch (cause) {
      const failure = normalizeApiError(cause);
      setError({ status: failure.status, text: failure.message });
    }
  }

  const title = view === "workspace" ? "Quiz workspace" : view === "submitted" ? "Quiz submitted" : "Quiz overview";
  return (
    <StudentWorkspaceLayout currentPage={`Class Catalog > Class Detail > ${title}`}>
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: 32 }}>
        <Link to={`/classes/${classId}`}><ArrowLeftOutlined /> Back to class</Link>
        {loading ? <div role="status" style={{ padding: 48, textAlign: "center" }}><Spin /> <span>Loading quiz…</span></div>
          : error && !settings ? <QuizError status={error.status} text={error.text} />
          : !settings ? <Empty description="Quiz not found." />
          : view === "workspace" && attempt ? (
            <QuizWorkspace attempt={attempt} onAttemptChange={setAttempt} onSubmit={(submitted) => { setResult(submitted); setView("submitted"); }} />
          ) : view === "submitted" && result ? (
            <SubmissionSummary result={result} onBack={() => setView("overview")} />
          ) : (
            <QuizOverview settings={settings} error={error} onStart={beginAttempt} />
          )}
      </main>
    </StudentWorkspaceLayout>
  );
}

function QuizOverview({ settings, error, onStart }: { settings: QuizSettings; error?: { status: number; text: string }; onStart: () => void }) {
  const [now] = useState(() => Date.now());
  const opening = settings.opening_time ? new Date(settings.opening_time) : undefined;
  const deadline = new Date(settings.deadline);
  const notOpen = opening && opening.getTime() > now;
  const expired = deadline.getTime() <= now;
  const disabled = Boolean(notOpen || expired);
  return (
    <section style={{ marginTop: 24 }}>
      <Typography.Title level={2}>Quiz</Typography.Title>
      <Typography.Paragraph type="secondary">Review the rules before starting. Your answers are saved as you go.</Typography.Paragraph>
      {error && <QuizError status={error.status} text={error.text} />}
      <Card>
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12}><Typography.Text type="secondary">Time limit</Typography.Text><div><ClockCircleOutlined /> {settings.time_limit_minutes} minutes</div></Col>
          <Col xs={24} sm={12}><Typography.Text type="secondary">Attempts</Typography.Text><div>{settings.attempts_allowed} allowed</div></Col>
          <Col xs={24} sm={12}><Typography.Text type="secondary">Opens</Typography.Text><div>{opening ? opening.toLocaleString() : "Immediately"}</div></Col>
          <Col xs={24} sm={12}><Typography.Text type="secondary">Deadline</Typography.Text><div>{deadline.toLocaleString()}</div></Col>
          <Col xs={24} sm={12}><Typography.Text type="secondary">Grading</Typography.Text><div>{settings.grading_method}</div></Col>
          <Col xs={24} sm={12}><Typography.Text type="secondary">Passing score</Typography.Text><div>{settings.required_score == null ? "Not specified" : `${settings.required_score}%`}</div></Col>
        </Row>
        <Alert style={{ marginTop: 24 }} type="info" showIcon message="Correct answers are not shown during an attempt." />
        {notOpen && <Alert style={{ marginTop: 16 }} type="warning" message={`This quiz opens ${opening?.toLocaleString()}.`} />}
        {expired && <Alert style={{ marginTop: 16 }} type="warning" message="This quiz is past its deadline." />}
        <Button type="primary" size="large" disabled={disabled} onClick={onStart} style={{ marginTop: 24 }}>Attempt quiz</Button>
      </Card>
    </section>
  );
}

function QuizWorkspace({ attempt, onAttemptChange, onSubmit }: { attempt: QuizAttempt; onAttemptChange: (attempt: QuizAttempt) => void; onSubmit: (result: QuizSubmitResult) => void }) {
  const { message } = App.useApp();
  const [remaining, setRemaining] = useState(Math.max(0, attempt.remaining_seconds));
  const [active, setActive] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const question = attempt.questions[active];
  const answered = attempt.questions.filter((item) => (item.selected_option_ids?.length ?? 0) > 0).length;

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (remaining === 0) message.warning("Time's up, your attempt may be auto-submitted.");
  }, [remaining, message]);

  async function choose(questionItem: QuizQuestion, selected: string[]) {
    setSaving(true);
    const next = { ...attempt, questions: attempt.questions.map((item) => item.question_id === questionItem.question_id ? { ...item, selected_option_ids: selected } : item) };
    onAttemptChange(next);
    try {
      if (selected.length) await saveQuizAnswer(attempt.attempt_id, questionItem.question_id, selected);
      else await clearQuizAnswer(attempt.attempt_id, questionItem.question_id);
    } catch (cause) {
      const failure = normalizeApiError(cause);
      message.error(failure.message);
    } finally { setSaving(false); }
  }

  async function submit() {
    try {
      const submitted = await submitQuizAttempt(attempt.attempt_id);
      onSubmit(submitted);
    } catch (cause) {
      const failure = normalizeApiError(cause);
      message.error(failure.message);
    }
  }

  if (!question) return <Empty description="This quiz has no questions yet." />;
  const selected = question.selected_option_ids ?? [];
  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
        <div><Typography.Title level={2}>Quiz workspace</Typography.Title><Typography.Text type="secondary">{answered} of {attempt.questions.length} answered</Typography.Text></div>
        <Tag color={remaining <= 60 ? "red" : "blue"}><ClockCircleOutlined /> {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</Tag>
      </div>
      <Progress percent={attempt.questions.length ? Math.round((answered / attempt.questions.length) * 100) : 0} showInfo={false} />
      <Card title={`Question ${active + 1} of ${attempt.questions.length}`} style={{ marginTop: 20 }}>
        <Typography.Paragraph>{question.content}</Typography.Paragraph>
        {question.question_type === "MCQ_MULTIPLE" ? (
          <Checkbox.Group value={selected} onChange={(values) => void choose(question, values.map(String))} options={question.options.map((option) => ({ label: option.content, value: option.option_id }))} />
        ) : (
          <Radio.Group value={selected[0]} onChange={(event) => void choose(question, [event.target.value])} options={question.options.map((option) => ({ label: option.content, value: option.option_id }))} />
        )}
      </Card>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 20 }}>
        <Button disabled={active === 0} onClick={() => setActive((value) => value - 1)}>Previous</Button>
        <div>{attempt.questions.map((item, index) => <Button key={item.question_id} type={index === active ? "primary" : "default"} icon={item.selected_option_ids?.length ? <CheckCircleOutlined /> : undefined} onClick={() => setActive(index)}>{index + 1}</Button>)}</div>
        {active < attempt.questions.length - 1 ? <Button type="primary" onClick={() => setActive((value) => value + 1)}>Next</Button> : <Button type="primary" loading={saving} onClick={() => setConfirmOpen(true)}>Finish attempt…</Button>}
      </div>
      <Modal open={confirmOpen} title="Submit attempt?" onCancel={() => setConfirmOpen(false)} onOk={() => { setConfirmOpen(false); void submit(); }} okText="Submit">
        <p>You have answered {answered} of {attempt.questions.length} questions.</p>
        <p>Unanswered questions score zero. You cannot resume this attempt after submitting.</p>
      </Modal>
    </section>
  );
}

function SubmissionSummary({ result, onBack }: { result: QuizSubmitResult; onBack: () => void }) {
  return <section style={{ marginTop: 24 }}><Card><Typography.Title level={2}>Attempt submitted</Typography.Title><Typography.Title level={1}>{result.score}%</Typography.Title><Tag color={result.passed === true ? "green" : result.passed === false ? "red" : "blue"}>{result.passed == null ? "Submitted" : result.passed ? "Passed" : "Not passed"}</Tag><Typography.Paragraph>{result.auto_submitted ? "This attempt was auto-submitted when time expired." : "Your attempt was submitted successfully."}</Typography.Paragraph><Button type="primary" onClick={onBack}>Return to quiz overview</Button></Card></section>;
}

function QuizError({ status, text }: { status: number; text: string }) {
  const title = status === 401 ? "Please sign in again" : status === 403 ? "You do not have access to this quiz" : status === 404 ? "Quiz unavailable" : status === 409 ? "Quiz unavailable or attempt limit reached" : status === 429 ? "Too many requests" : status === 503 ? "Quiz service unavailable" : "Could not load quiz";
  return <Alert type="error" showIcon title={title} description={text} style={{ marginTop: 24 }} />;
}
