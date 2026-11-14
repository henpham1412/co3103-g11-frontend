import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, expect, it } from "vitest";
import { server } from "@/test/server";
import { classProgress } from "@/test/fixtures/progress";
import { outlineProgress, recommendation } from "@/test/fixtures/recommendation";
import ClassProgressPanel from "./ClassProgressPanel";

const base = "http://localhost:8081/api/v1/classes";
const seen: { method: string; path: string }[] = [];
function record({ request }: { request: Request }) { seen.push({ method: request.method, path: new URL(request.url).pathname }); }
function Destination() { const location = useLocation(); return <h1>Destination: {location.pathname}</h1>; }
function view(classId = "class-123") {
  return <MemoryRouter><Routes><Route path="/" element={<ClassProgressPanel classId={classId} />} /><Route path="*" element={<Destination />} /></Routes></MemoryRouter>;
}
beforeEach(() => {
  seen.length = 0; server.events.on("request:start", record);
  server.use(
    http.get(`${base}/:classId/progress`, ({ params }) => HttpResponse.json(outlineProgress(String(params.classId)))),
    http.get(`${base}/:classId/resume-target`, ({ params }) => HttpResponse.json(outlineProgress(String(params.classId)).resume_target)),
    http.get(`${base}/:classId/recommended-activities`, ({ params }) => HttpResponse.json(recommendation(String(params.classId)))),
  );
});
afterEach(() => server.events.removeListener("request:start", record));

it("shows a Quiz recommendation for an outline target, preserving existing progress and null evidence", async () => {
  render(view());
  expect(await screen.findByText("Practice: Java Variables")).toBeInTheDocument();
  expect(screen.getByText("2 of 2 lessons complete")).toBeInTheDocument();
  expect(screen.getByText("Additional practice")).toBeInTheDocument();
  expect(screen.getByText("Java Syntax: Developing")).toBeInTheDocument();
  expect(screen.getByText("Collections: No assessment evidence")).toBeInTheDocument();
  expect(screen.queryByText(/Collections: Weak/)).not.toBeInTheDocument();
  expect(screen.queryByText(/mastery_score|evidence_available/)).not.toBeInTheDocument();
  expect(seen.every(request => request.method === "GET")).toBe(true);
});

it.each(["QUIZ_ATTEMPT", "LESSON"] as const)("preserves %s resume precedence without requesting recommendations", async type => {
  const data = classProgress();
  const target = type === "LESSON" ? { target_type: "LESSON", target_id: "lesson-2", reason: "FIRST_INCOMPLETE_LESSON" } : data.resume_target;
  server.use(http.get(`${base}/class-123/progress`, () => HttpResponse.json(data)),
    http.get(`${base}/class-123/resume-target`, () => HttpResponse.json(target)));
  render(view()); await screen.findByText("0 of 2 lessons complete");
  expect(screen.queryByText("Recommended next Quiz")).not.toBeInTheDocument();
  expect(seen.some(request => request.path.endsWith("recommended-activities"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Continue learning" }));
  expect(await screen.findByRole("heading", { name: /^Destination:/ })).toHaveTextContent(type === "LESSON" ? "/lessons/lesson-2" : "/lessons/lesson-1/activities/activity-1");
});

it.each([403, 500])("does not treat a failed initial resume read as an outline target (%s)", async status => {
  server.use(http.get(`${base}/class-123/resume-target`, () => HttpResponse.json({ message: "Resume unavailable", code: "UNAVAILABLE", details: [] }, { status })));
  render(view()); expect(await screen.findByText("Could not load learning progress")).toBeInTheDocument();
  expect(seen.some(request => request.path.endsWith("recommended-activities"))).toBe(false);
  expect(screen.queryByRole("button", { name: "Open recommended Quiz" })).not.toBeInTheDocument();
  server.use(http.get(`${base}/class-123/resume-target`, () => HttpResponse.json(outlineProgress().resume_target)));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Practice: Java Variables")).toBeInTheDocument();
});

it("blocks recommendation when the initial resume request has a network failure", async () => {
  server.use(http.get(`${base}/class-123/resume-target`, () => HttpResponse.error()));
  render(view()); await screen.findByText("Could not load learning progress");
  expect(seen.some(request => request.path.endsWith("recommended-activities"))).toBe(false);
});

it.each(["NO_ELIGIBLE_ACTIVITY", "CLASS_ARCHIVED"])("renders %s independently of failures and retains the normal outline", async reason => {
  server.use(http.get(`${base}/class-123/recommended-activities`, () => HttpResponse.json({ class_id: "class-123", recommendation: null, reason })));
  render(view());
  expect(await screen.findByText(reason === "CLASS_ARCHIVED" ? "This class is archived. No new learning activity is recommended." : "No eligible activity is available.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View class outline" })).toHaveAttribute("href", "/classes/class-123");
  expect(screen.queryByRole("button", { name: "Open recommended Quiz" })).not.toBeInTheDocument();
});

it("renders the normal-sequence reason and empty topic associations without inventing mastery", async () => {
  const data = recommendation(); if (!data.recommendation) throw new Error("Fixture needs a Quiz");
  data.recommendation.reason = "NORMAL_SEQUENCE"; data.recommendation.skill_topics = [];
  server.use(http.get(`${base}/class-123/recommended-activities`, () => HttpResponse.json(data)));
  render(view()); await screen.findByText("Recommended next Quiz");
  expect(screen.getByText("Next learning activity")).toBeInTheDocument();
  expect(screen.getByText("No topic information is associated with this activity.")).toBeInTheDocument();
});

it("displays Weak and Sufficient levels exactly as supplied without inventing numeric scores", async () => {
  const data = recommendation(); if (!data.recommendation) throw new Error("Fixture needs a Quiz");
  data.recommendation.skill_topics = [{ skill_topic_id: "weak", name: "Weak topic", mastery_level: "WEAK" }, { skill_topic_id: "sufficient", name: "Strong topic", mastery_level: "SUFFICIENT" }];
  server.use(http.get(`${base}/class-123/recommended-activities`, () => HttpResponse.json(data)));
  render(view()); expect(await screen.findByText("Weak topic: Weak")).toBeInTheDocument();
  expect(screen.getByText("Strong topic: Sufficient")).toBeInTheDocument();
});

it("shows loading before the recommendation response", async () => {
  let finish!: () => void;
  const deferred = new Promise<void>(resolve => { finish = resolve; });
  server.use(http.get(`${base}/class-123/recommended-activities`, async () => { await deferred; return HttpResponse.json(recommendation()); }));
  render(view()); expect(await screen.findByText("Loading recommended activity…")).toBeInTheDocument();
  await act(async () => finish()); expect(await screen.findByText("Practice: Java Variables")).toBeInTheDocument();
});

it("retries a failed recommendation through a fresh canonical resume gate", async () => {
  server.use(http.get(`${base}/class-123/recommended-activities`, () => HttpResponse.json({ message: "Unavailable", code: "UNAVAILABLE", details: [] }, { status: 503 })));
  render(view()); await screen.findByText("Could not load recommended activity");
  expect(screen.queryByText("No eligible activity is available.")).not.toBeInTheDocument();
  server.use(http.get(`${base}/class-123/recommended-activities`, () => HttpResponse.json(recommendation())));
  fireEvent.click(screen.getByRole("button", { name: "Retry recommendation" }));
  expect(await screen.findByText("Practice: Java Variables")).toBeInTheDocument();
  expect(seen.filter(request => request.path.endsWith("resume-target"))).toHaveLength(2);
});

it("opens the exact Quiz/lesson relationship with empty attempts using GET requests only", async () => {
  render(view()); await screen.findByText("Practice: Java Variables");
  fireEvent.click(screen.getByRole("button", { name: "Open recommended Quiz" }));
  expect(await screen.findByRole("heading", { name: /^Destination:/ })).toHaveTextContent("/classes/class-123/lessons/lesson-1/activities/activity-1");
  expect(seen.every(request => request.method === "GET")).toBe(true);
  expect(seen.some(request => request.path.includes("assessment-history") || request.path.includes("/attempts"))).toBe(false);
});

it("does not construct a guessed route for an unresolved target and supports refresh", async () => {
  const data = recommendation(); if (!data.recommendation) throw new Error("Fixture needs a Quiz"); data.recommendation.activity_id = "missing";
  server.use(http.get(`${base}/class-123/recommended-activities`, () => HttpResponse.json(data)));
  render(view()); await screen.findByText("Recommended activity is unavailable");
  expect(screen.queryByRole("button", { name: "Open recommended Quiz" })).not.toBeInTheDocument();
  server.use(http.get(`${base}/class-123/recommended-activities`, () => HttpResponse.json(recommendation())));
  fireEvent.click(screen.getByRole("button", { name: "Refresh recommendation" }));
  expect(await screen.findByRole("button", { name: "Open recommended Quiz" })).toBeInTheDocument();
});

it("refuses navigation if the Activity disappears during the click-time progress refresh", async () => {
  render(view()); await screen.findByText("Practice: Java Variables");
  const data = outlineProgress(); data.chapters[0].lessons[0].assessment_statuses = [];
  server.use(http.get(`${base}/class-123/progress`, () => HttpResponse.json(data)));
  fireEvent.click(screen.getByRole("button", { name: "Open recommended Quiz" }));
  await screen.findByText("Progress action unavailable");
  expect(screen.queryByRole("heading", { name: /^Destination:/ })).not.toBeInTheDocument();
});

it.each(["LESSON", "QUIZ_ATTEMPT"] as const)("a newly available %s target wins when opening a previously shown recommendation", async type => {
  render(view()); await screen.findByText("Practice: Java Variables");
  const current = classProgress();
  const target = type === "LESSON" ? { target_type: "LESSON", target_id: "lesson-2", reason: "FIRST_INCOMPLETE_LESSON" } : current.resume_target;
  server.use(http.get(`${base}/class-123/resume-target`, () => HttpResponse.json(target)),
    http.get(`${base}/class-123/progress`, () => HttpResponse.json(current)));
  fireEvent.click(screen.getByRole("button", { name: "Open recommended Quiz" }));
  expect(await screen.findByRole("heading", { name: /^Destination:/ })).toHaveTextContent(type === "LESSON" ? "/lessons/lesson-2" : "/lessons/lesson-1/activities/activity-1");
  expect(seen.every(request => request.method === "GET")).toBe(true);
});

it("uses the newer Lesson target from refreshed progress after an outline resume recheck", async () => {
  render(view()); await screen.findByText("Practice: Java Variables");
  const current = outlineProgress();
  current.resume_target = { target_type: "LESSON", target_id: "lesson-2", reason: "FIRST_INCOMPLETE_LESSON" };
  Object.assign(current, { status: "IN_PROGRESS", completed_lessons: 1, progress_percentage: 50 });
  Object.assign(current.chapters[0], { completed_lessons: 1, progress_percentage: 50 });
  current.chapters[0].lessons[1].completed = false;
  current.chapters[0].lessons[1].marked_at = null;
  server.use(http.get(`${base}/class-123/resume-target`, () => HttpResponse.json(outlineProgress().resume_target)),
    http.get(`${base}/class-123/progress`, () => HttpResponse.json(current)));
  fireEvent.click(screen.getByRole("button", { name: "Open recommended Quiz" }));
  const destination = await screen.findByRole("heading", { name: /^Destination:/ });
  expect(destination).toHaveTextContent("Destination: /classes/class-123/lessons/lesson-2");
  expect(destination).not.toHaveTextContent("/activities/activity-1");
});

it("uses the exact newer Quiz Attempt mapping from refreshed progress after an outline resume recheck", async () => {
  render(view()); await screen.findByText("Practice: Java Variables");
  const current = classProgress();
  const assessment = current.chapters[0].lessons[0].assessment_statuses[0];
  current.chapters[0].lessons[1].assessment_statuses = [{ ...assessment, activity_id: "activity-new",
    attempts: [{ ...assessment.attempts[0], attempt_id: "attempt-new", started_at: "2026-11-01T02:00:00Z" }] }];
  current.resume_target = { target_type: "QUIZ_ATTEMPT", target_id: "attempt-new", reason: "IN_PROGRESS_ATTEMPT" };
  server.use(http.get(`${base}/class-123/resume-target`, () => HttpResponse.json(outlineProgress().resume_target)),
    http.get(`${base}/class-123/progress`, () => HttpResponse.json(current)));
  fireEvent.click(screen.getByRole("button", { name: "Open recommended Quiz" }));
  const destination = await screen.findByRole("heading", { name: /^Destination:/ });
  expect(destination).toHaveTextContent("Destination: /classes/class-123/lessons/lesson-2/activities/activity-new");
  expect(destination).not.toHaveTextContent("/activities/activity-1");
});

it.each([
  ["missing target", null],
  ["unsupported target", { target_type: "UNSUPPORTED", target_id: "attempt-old" }],
  ["missing Lesson identifier", { target_type: "LESSON", target_id: null }],
  ["foreign outline identifier", { target_type: "CLASS_OUTLINE", target_id: "other-class" }],
  ["unresolvable Quiz Attempt", { target_type: "QUIZ_ATTEMPT", target_id: "missing-attempt" }],
])("does not fall back to the recommendation when refreshed progress has a %s", async (_description, resume_target) => {
  render(view()); await screen.findByText("Practice: Java Variables");
  server.use(http.get(`${base}/class-123/resume-target`, () => HttpResponse.json(outlineProgress().resume_target)),
    http.get(`${base}/class-123/progress`, () => HttpResponse.json({ ...classProgress(), resume_target })));
  fireEvent.click(screen.getByRole("button", { name: "Open recommended Quiz" }));
  await screen.findByText("Progress action unavailable");
  expect(screen.getByRole("button", { name: "Refresh learning progress" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /^Destination:/ })).not.toBeInTheDocument();
});

it("does not open the stale recommendation when the click-time progress refresh fails", async () => {
  render(view()); await screen.findByText("Practice: Java Variables");
  server.use(http.get(`${base}/class-123/resume-target`, () => HttpResponse.json(outlineProgress().resume_target)),
    http.get(`${base}/class-123/progress`, () => HttpResponse.json({ code: "UNAVAILABLE", message: "Progress unavailable", details: [] }, { status: 500 })));
  fireEvent.click(screen.getByRole("button", { name: "Open recommended Quiz" }));
  await screen.findByText("Progress action unavailable");
  expect(screen.queryByRole("heading", { name: /^Destination:/ })).not.toBeInTheDocument();
});

it("does not navigate or retain a competing card after a failed click-time resume recheck", async () => {
  render(view()); await screen.findByText("Practice: Java Variables");
  server.use(http.get(`${base}/class-123/resume-target`, () => HttpResponse.json({ message: "Read denied", code: "FORBIDDEN", details: [] }, { status: 403 })));
  fireEvent.click(screen.getByRole("button", { name: "Open recommended Quiz" }));
  await screen.findByText("Progress action unavailable");
  expect(screen.queryByRole("heading", { name: /^Destination:/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Open recommended Quiz" })).not.toBeInTheDocument();
});

it("invalidates an old Class recommendation immediately on a Class change", async () => {
  const ui = render(view()); await screen.findByText("Practice: Java Variables");
  server.use(http.get(`${base}/other-class/recommended-activities`, () => HttpResponse.json({ class_id: "other-class", recommendation: null, reason: "NO_ELIGIBLE_ACTIVITY" })));
  ui.rerender(view("other-class"));
  expect(screen.queryByText("Practice: Java Variables")).not.toBeInTheDocument();
  expect(await screen.findByText("No eligible activity is available.")).toBeInTheDocument();
});

it("ignores an old Class response that completes after cancellation", async () => {
  let finish!: () => void;
  const deferred = new Promise<void>(resolve => { finish = resolve; });
  server.use(http.get(`${base}/class-123/recommended-activities`, async () => { await deferred; return HttpResponse.json(recommendation()); }),
    http.get(`${base}/other-class/recommended-activities`, () => HttpResponse.json({ class_id: "other-class", recommendation: null, reason: "NO_ELIGIBLE_ACTIVITY" })));
  const ui = render(view()); await screen.findByText("Loading recommended activity…");
  ui.rerender(view("other-class")); await screen.findByText("No eligible activity is available.");
  await act(async () => finish());
  await waitFor(() => expect(screen.queryByText("Practice: Java Variables")).not.toBeInTheDocument());
});

it("does not navigate using a delayed action from a previous Class", async () => {
  const ui = render(view());
  await screen.findByText("Practice: Java Variables");
  const before = seen.filter(request => request.path.endsWith("resume-target")).length;
  let finish!: () => void;
  const deferred = new Promise<void>(resolve => { finish = resolve; });
  server.use(http.get(`${base}/class-123/resume-target`, async () => { await deferred; return HttpResponse.json(outlineProgress().resume_target); }));
  fireEvent.click(screen.getByRole("button", { name: "Open recommended Quiz" }));
  await waitFor(() => expect(seen.filter(request => request.path.endsWith("resume-target"))).toHaveLength(before + 1));
  ui.rerender(view("other-class"));
  await screen.findByText("Practice: Java Variables");
  await act(async () => finish());
  expect(screen.queryByRole("heading", { name: /^Destination:/ })).not.toBeInTheDocument();
});
