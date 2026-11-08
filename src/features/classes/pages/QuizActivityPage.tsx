import { useCallback, useEffect, useState } from "react";
import { Alert, App, Button, Card, Checkbox, Col, Empty, Modal, Progress, Radio, Row, Spin, Tag, Typography } from "antd";
import { ArrowLeftOutlined, CheckCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { Link, useParams } from "react-router-dom";
import { normalizeApiError } from "@/api/apiError";
import StudentWorkspaceLayout from "../../../components/layout/StudentWorkspaceLayout";
import { clearQuizAnswer, getQuizAttempt, getQuizSettings, saveQuizAnswer, startOrResumeQuiz, submitQuizAttempt } from "../api/quizApi";
import type { QuizAttempt, QuizQuestion, QuizSettings, QuizSubmitResult } from "../quiz-types";

type View = "overview" | "workspace";
const attemptStorageKey = (activityId: string) => `quiz-attempt:${activityId}`;

export default function QuizActivityPage() {
  const { classId = "", activityId = "" } = useParams();
  const [settings, setSettings] = useState<QuizSettings>();
  const [attempt, setAttempt] = useState<QuizAttempt>();
  const [lastResult, setLastResult] = useState<QuizSubmitResult>();
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; text: string }>();

  const loadSettings = useCallback(async (signal?: AbortSignal) => {
    const value = await getQuizSettings(activityId, signal);
    setSettings(value);
    const savedAttemptId = window.sessionStorage.getItem(attemptStorageKey(activityId));
    const currentAttempt = value.current_attempt;
    if (currentAttempt?.status === "IN_PROGRESS") {
      setAttempt(currentAttempt);
    } else if (savedAttemptId) {
      try {
        const resumed = await getQuizAttempt(savedAttemptId, signal);
        if (resumed.status === "IN_PROGRESS") {
          setAttempt(resumed);
          setView("workspace");
        } else {
          window.sessionStorage.removeItem(attemptStorageKey(activityId));
        }
      } catch {
        window.sessionStorage.removeItem(attemptStorageKey(activityId));
      }
    }
  }, [activityId]);

  useEffect(() => {
    const controller = new AbortController();
    // The request synchronizes the externally owned attempt with this page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSettings(controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted) {
        const failure = normalizeApiError(cause);
        setError({ status: failure.status, text: failure.message });
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activityId, loadSettings]);

  async function beginAttempt() {
    if (!settings) return;
    setError(undefined);
    try {
      const next = await startOrResumeQuiz(settings.quiz_id);
      setAttempt(next);
      window.sessionStorage.setItem(attemptStorageKey(activityId), next.attempt_id);
      setView("workspace");
    } catch (cause) {
      const failure = normalizeApiError(cause);
      setError({ status: failure.status, text: failure.message });
    }
  }

  async function refreshAfterSubmit() {
    window.sessionStorage.removeItem(attemptStorageKey(activityId));
    setView("overview");
    try {
      await loadSettings();
    } catch (cause) {
      const failure = normalizeApiError(cause);
      setError({ status: failure.status, text: failure.message });
    }
  }

  const title = view === "workspace" ? "Quiz workspace" : "Quiz overview";
  return (
    <StudentWorkspaceLayout currentPage={`Class Catalog > Class Detail > ${title}`}>
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: 32 }}>
        <Link to={`/classes/${classId}`}><ArrowLeftOutlined /> Back to class</Link>
        {loading ? <div role="status" style={{ padding: 48, textAlign: "center" }}><Spin /> <span>Loading quiz…</span></div>
          : error && !settings ? <QuizError status={error.status} text={error.text} />
          : !settings ? <Empty description="Quiz not found." />
          : view === "workspace" && attempt ? (
            <QuizWorkspace attempt={attempt} onAttemptChange={setAttempt} onSubmit={(submitted) => { setLastResult(submitted); void refreshAfterSubmit(); }} />
          ) : (
            <QuizOverview settings={settings} error={error} lastResult={lastResult} onStart={beginAttempt} />
          )}
      </main>
    </StudentWorkspaceLayout>
  );
}

function QuizOverview({ settings, error, lastResult, onStart }: { settings: QuizSettings; error?: { status: number; text: string }; lastResult?: QuizSubmitResult; onStart: () => void }) {
  const [now] = useState(() => Date.now());
  const opening = settings.opening_time ? new Date(settings.opening_time) : undefined;
  const deadline = new Date(settings.deadline);
  const notOpen = opening ? opening.getTime() > now : false;
  const expired = deadline.getTime() <= now;
  const inProgress = settings.current_attempt?.status === "IN_PROGRESS";
  const attemptsUsed = settings.attempts_used ?? settings.attempts?.length ?? 0;
  const attemptsExhausted = attemptsUsed >= settings.attempts_allowed;
  const title = settings.title ?? "Quiz";
  return (
    <section style={{ marginTop: 24 }}>
      <Typography.Title level={2}>{title}</Typography.Title>
      {settings.description && <Typography.Paragraph>{settings.description}</Typography.Paragraph>}
      {error && <QuizError status={error.status} text={error.text} />}
      {lastResult && <Alert type="success" showIcon message="Your latest attempt was submitted." description={`${lastResult.score}%${lastResult.auto_submitted ? " · Auto-submitted" : ""}`} />}
      <Card>
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12}><Typography.Text type="secondary">Time limit</Typography.Text><div><ClockCircleOutlined /> {settings.time_limit_minutes} minutes</div></Col>
          <Col xs={24} sm={12}><Typography.Text type="secondary">Attempts</Typography.Text><div>{attemptsUsed} used / {settings.attempts_allowed} allowed</div></Col>
          <Col xs={24} sm={12}><Typography.Text type="secondary">Current score</Typography.Text><div>{settings.current_score == null ? "Not submitted" : `${settings.current_score}%`}</div></Col>
          <Col xs={24} sm={12}><Typography.Text type="secondary">Passing grade</Typography.Text><div>{settings.required_score == null ? "Not specified" : `${settings.required_score}%`}</div></Col>
          <Col xs={24} sm={12}><Typography.Text type="secondary">Grading</Typography.Text><div>{settings.grading_method}</div></Col>
          <Col xs={24} sm={12}><Typography.Text type="secondary">Opens</Typography.Text><div>{opening ? opening.toLocaleString() : "Immediately"}</div></Col>
          <Col xs={24} sm={12}><Typography.Text type="secondary">Deadline</Typography.Text><div>{deadline.toLocaleString()}</div></Col>
        </Row>
        {settings.attempts?.length ? <div style={{ marginTop: 24 }}><Typography.Title level={5}>Past attempts</Typography.Title>{settings.attempts.map((item) => <div key={item.attempt_id}><Tag>{item.attempt_number}</Tag>{item.score == null ? "In progress" : `${item.score}%`} · {item.passed == null ? "Not graded" : item.passed ? "Passed" : "Not passed"} · {item.submitted_at ? new Date(item.submitted_at).toLocaleString() : "Not submitted"}{item.auto_submitted ? " · Auto-submitted" : ""}</div>)}</div> : null}
        <Alert style={{ marginTop: 24 }} type="info" showIcon message="Correct answers are not shown during an attempt." />
        {notOpen && <Alert style={{ marginTop: 16 }} type="warning" message={`This quiz opens ${opening?.toLocaleString()}.`} />}
        {expired && !inProgress && <Alert style={{ marginTop: 16 }} type="warning" message="This quiz is past its deadline." />}
        {attemptsExhausted && !inProgress && <Alert style={{ marginTop: 16 }} type="warning" message="You have used all allowed attempts." />}
        <Button type="primary" size="large" disabled={(!inProgress && (notOpen || expired || attemptsExhausted))} onClick={onStart} style={{ marginTop: 24 }}>{inProgress ? "Resume" : "Attempt quiz"}</Button>
      </Card>
    </section>
  );
}

function QuizWorkspace({ attempt, onAttemptChange, onSubmit }: { attempt: QuizAttempt; onAttemptChange: (attempt: QuizAttempt) => void; onSubmit: (result: QuizSubmitResult) => void }) {
  const { message } = App.useApp();
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.floor((new Date(attempt.end_at).getTime() - Date.now()) / 1000)));
  const [active, setActive] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [expired, setExpired] = useState(false);
  const question = attempt.questions[active];
  const answered = attempt.questions.filter((item) => (item.selected_option_ids?.length ?? 0) > 0).length;

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.floor((new Date(attempt.end_at).getTime() - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0) setExpired(true);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [attempt.end_at]);

  useEffect(() => {
    if (!expired) return;
    let activeRequest = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const latest = await getQuizAttempt(attempt.attempt_id);
        if (!activeRequest) return;
        if (latest.status === "SUBMITTED") {
          onSubmit({ attempt_id: latest.attempt_id, status: "SUBMITTED", auto_submitted: latest.auto_submitted ?? true, score: latest.score ?? 0, required_score: latest.required_score ?? null, passed: latest.passed ?? null, submitted_at: latest.submitted_at ?? new Date().toISOString() });
          return;
        }
        onAttemptChange(latest);
        message.warning("Time's up. Waiting for the server to complete your attempt.");
        timer = window.setTimeout(() => void poll(), 2000);
      } catch {
        if (activeRequest) timer = window.setTimeout(() => void poll(), 2000);
      }
    };
    void poll();
    return () => { activeRequest = false; if (timer !== undefined) window.clearTimeout(timer); };
  // The parent owns these callbacks; they intentionally remain stable for one attempt.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired, attempt.attempt_id, message]);

  async function choose(questionItem: QuizQuestion, selected: string[]) {
    if (expired) return;
    const previous = attempt;
    setSaveState("saving");
    onAttemptChange({ ...attempt, questions: attempt.questions.map((item) => item.question_id === questionItem.question_id ? { ...item, selected_option_ids: selected } : item) });
    try {
      if (selected.length) await saveQuizAnswer(attempt.attempt_id, questionItem.question_id, selected);
      else await clearQuizAnswer(attempt.attempt_id, questionItem.question_id);
      setSaveState("saved");
    } catch (cause) {
      onAttemptChange(previous);
      setSaveState("error");
      message.error(normalizeApiError(cause).message);
    }
  }

  async function submit() {
    if (expired) return;
    try { onSubmit(await submitQuizAttempt(attempt.attempt_id)); }
    catch (cause) { message.error(normalizeApiError(cause).message); }
  }
  if (!question) return <Empty description="This quiz has no questions yet." />;
  const selected = question.selected_option_ids ?? [];
  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}><div><Typography.Title level={2}>Quiz workspace</Typography.Title><Typography.Text type="secondary">{answered} of {attempt.questions.length} answered</Typography.Text></div><Tag color={remaining <= 60 ? "red" : "blue"}><ClockCircleOutlined /> {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</Tag></div>
      <Typography.Text type={saveState === "error" ? "danger" : "secondary"}>{saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}</Typography.Text>
      <Progress percent={attempt.questions.length ? Math.round((answered / attempt.questions.length) * 100) : 0} showInfo={false} />
      <Card title={`Question ${active + 1} of ${attempt.questions.length}`} style={{ marginTop: 20 }}><Typography.Paragraph>{question.content}</Typography.Paragraph>{question.question_type === "MCQ_MULTIPLE" ? <Checkbox.Group disabled={expired} value={selected} onChange={(values) => void choose(question, values.map(String))} options={question.options.map((option) => ({ label: option.content, value: option.option_id }))} /> : <Radio.Group disabled={expired} value={selected[0]} onChange={(event) => void choose(question, [event.target.value])} options={question.options.map((option) => ({ label: option.content, value: option.option_id }))} />}</Card>
      <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 20 }}><Button disabled={expired || active === 0} onClick={() => setActive((value) => value - 1)}>Previous</Button><div>{attempt.questions.map((item, index) => <Button disabled={expired} key={item.question_id} type={index === active ? "primary" : "default"} icon={item.selected_option_ids?.length ? <CheckCircleOutlined /> : undefined} onClick={() => setActive(index)}>{index + 1}</Button>)}</div>{active < attempt.questions.length - 1 ? <Button disabled={expired} type="primary" onClick={() => setActive((value) => value + 1)}>Next</Button> : <Button disabled={expired} type="primary" onClick={() => setConfirmOpen(true)}>Finish attempt…</Button>}</div>
      <Modal open={confirmOpen && !expired} title="Submit attempt?" onCancel={() => setConfirmOpen(false)} onOk={() => { setConfirmOpen(false); void submit(); }} okText="Submit"><p>You have answered {answered} of {attempt.questions.length} questions.</p><p>Unanswered questions score zero. You cannot resume this attempt after submitting.</p></Modal>
    </section>
  );
}

function QuizError({ status, text }: { status: number; text: string }) {
  const title = status === 401 ? "Please sign in again" : status === 403 ? "You do not have access to this quiz" : status === 404 ? "Quiz unavailable" : status === 409 ? "Quiz unavailable or attempt limit reached" : status === 429 ? "Too many requests" : status === 503 ? "Quiz service unavailable" : "Could not load quiz";
  return <Alert type="error" showIcon title={title} description={text} style={{ marginTop: 24 }} />;
}
