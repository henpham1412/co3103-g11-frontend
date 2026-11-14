import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { memberProgress, tutorProgress } from "@/test/fixtures/progress";
import { preciseMasteryScore, rawTutorMastery } from "@/test/fixtures/tutorMastery";
import { authSession } from "@/test/fixtures/auth";
import { installAuthInterceptors } from "@/api/authInterceptors";
import TutorProgressPanel from "./TutorProgressPanel";

const base = "http://localhost:8081/api/v1/tutor/classes";
const endpoint = `${base}/class-123/members/a/mastery`;
const seen: string[] = [];
let uninstall: (() => void) | undefined;
const json = (raw: string) => new HttpResponse(raw, { headers: { "Content-Type": "application/json" } });
function record({ request }: { request: Request }) { seen.push(new URL(request.url).pathname); }
async function select(member = "a") { fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Learner ${member}`) })); }
function mastery() { return screen.getByRole("region", { name: "Topic mastery" }); }
function defer() { let finish!: () => void; const promise = new Promise<void>(resolve => { finish = resolve; }); return { promise, finish }; }

beforeEach(() => {
  seen.length = 0; server.events.on("request:start", record);
  server.use(
    http.get(`${base}/:classId/progress`, ({ params }) => HttpResponse.json(tutorProgress(String(params.classId)))),
    http.get(`${base}/:classId/members/:memberId/progress`, ({ params }) => HttpResponse.json(memberProgress(String(params.memberId), String(params.classId)))),
    http.get(`${base}/:classId/members/:memberId/mastery`, ({ params }) => json(rawTutorMastery(String(params.classId), String(params.memberId)))),
  );
});
afterEach(() => { uninstall?.(); uninstall = undefined; server.events.removeListener("request:start", record); });

it("loads only the selected member and preserves completion, outcomes and LMS-7 mastery", async () => {
  render(<TutorProgressPanel classId="class-123" revision={0} />);
  await screen.findByRole("button", { name: /Learner a/ });
  expect(seen.some(path => path.endsWith("/mastery"))).toBe(false);
  await select(); await screen.findByText(`${preciseMasteryScore}% · DEVELOPING`);
  expect(within(mastery()).getByText("0% · WEAK")).toBeInTheDocument();
  expect(within(mastery()).getByText("85.5% · SUFFICIENT")).toBeInTheDocument();
  expect(within(mastery()).getByText("No assessment evidence")).toBeInTheDocument();
  expect(within(mastery()).queryByText("80% · SUFFICIENT")).not.toBeInTheDocument();
  expect(screen.getByText("Known zero: WEAK")).toBeInTheDocument();
  expect(screen.getByText("No evidence: No assessment evidence")).toBeInTheDocument();
  expect(screen.getByText(/0 of 2 lessons complete/)).toHaveTextContent("IN_PROGRESS");
  expect(screen.getByText(/Quiz a · Attempt 1/)).toHaveTextContent("0% · Review this topic");
  expect(seen.filter(path => path.endsWith("/mastery"))).toEqual(["/api/v1/tutor/classes/class-123/members/a/mastery"]);
  fireEvent.click(screen.getByText("Chapter"));
  expect(await screen.findByText("○ Setup")).toBeInTheDocument();
});

it("shows a real empty-topic state independently of missing evidence", async () => {
  server.use(http.get(endpoint, () => json('{"class_id":"class-123","class_member_id":"a","items":[]}')));
  render(<TutorProgressPanel classId="class-123" revision={0} />); await select();
  expect(await screen.findByText("No SkillTopics are available for this class.")).toBeInTheDocument();
  expect(within(mastery()).queryByText("No assessment evidence")).not.toBeInTheDocument();
  expect(screen.getByText("Known zero: WEAK")).toBeInTheDocument();
});

it("keeps loading distinct while retaining the loaded member progress", async () => {
  const pending = defer();
  server.use(http.get(endpoint, async () => { await pending.promise; return json(rawTutorMastery()); }));
  render(<TutorProgressPanel classId="class-123" revision={0} />); await select();
  expect(await screen.findByText("Loading topic mastery…")).toBeInTheDocument();
  expect(screen.getByText("Known zero: WEAK")).toBeInTheDocument();
  expect(screen.queryByText("No SkillTopics are available for this class.")).not.toBeInTheDocument();
  await act(async () => pending.finish());
  expect(await screen.findByText(`${preciseMasteryScore}% · DEVELOPING`)).toBeInTheDocument();
});

it.each(["server", "network"])("independently retries a %s failure while preserving other progress", async kind => {
  server.use(http.get(endpoint, () => kind === "server" ? HttpResponse.json({ code: "UNAVAILABLE", message: "Temporary failure", details: [] }, { status: 500 }) : HttpResponse.error()));
  render(<TutorProgressPanel classId="class-123" revision={0} />); await select();
  expect(await screen.findByText("Could not load topic mastery")).toBeInTheDocument();
  expect(screen.getByText("Known zero: WEAK")).toBeInTheDocument();
  expect(screen.getByText(/Quiz a · Attempt 1/)).toBeInTheDocument();
  expect(screen.queryByText("No SkillTopics are available for this class.")).not.toBeInTheDocument();
  const progressReads = seen.filter(path => path.endsWith("/progress")).length;
  server.use(http.get(endpoint, () => json(rawTutorMastery())));
  fireEvent.click(screen.getByRole("button", { name: "Retry mastery" }));
  expect(await screen.findByText(`${preciseMasteryScore}% · DEVELOPING`)).toBeInTheDocument();
  expect(seen.filter(path => path.endsWith("/progress"))).toHaveLength(progressReads);
});

it("uses the existing unauthorized-session handling for a mastery 401", async () => {
  const session = authSession(); const purgeSession = vi.fn();
  uninstall = installAuthInterceptors({ getSessionSnapshot: () => ({ session, generation: 3 }), purgeSession, onLmsForbidden: vi.fn() });
  server.use(http.get(endpoint, () => HttpResponse.json({ code: "UNAUTHORIZED", message: "Session expired", details: [] }, { status: 401 })));
  render(<TutorProgressPanel classId="class-123" revision={0} />); await select();
  await screen.findByText("Could not load topic mastery");
  expect(purgeSession).toHaveBeenCalledExactlyOnceWith("unauthorized", 3);
  expect(within(mastery()).queryByText(/% ·/)).not.toBeInTheDocument();
});

it.each([403, 404])("invalidates details and refreshes the active list after mastery access rejection (%s)", async status => {
  render(<TutorProgressPanel classId="class-123" revision={0} />); await select();
  await screen.findByText(`${preciseMasteryScore}% · DEVELOPING`);
  let listReads = 0;
  server.use(http.get(`${base}/class-123/progress`, () => { listReads++; return HttpResponse.json(tutorProgress()); }),
    http.get(endpoint, () => HttpResponse.json({ code: "CLASS_OR_MEMBER_NOT_FOUND", message: "Member is no longer accessible", details: [] }, { status })));
  // Reselecting the member obtains a fresh response instead of retaining the old snapshot.
  fireEvent.click(screen.getByRole("button", { name: /Learner b/ }));
  await screen.findByText("Student b");
  fireEvent.click(screen.getByRole("button", { name: /Learner a/ }));
  expect(screen.queryByText(`${preciseMasteryScore}% · DEVELOPING`)).not.toBeInTheDocument();
  expect(await screen.findByText("Student mastery is unavailable")).toBeInTheDocument();
  await waitFor(() => expect(listReads).toBe(1));
  expect(screen.queryByText("Student a")).not.toBeInTheDocument();
  expect(screen.queryByText("Known zero: WEAK")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Topic mastery" })).not.toBeInTheDocument();
  expect(seen.filter(path => path.endsWith("/members/a/mastery"))).toHaveLength(2);
});

it("clears old mastery immediately on member change before the new request completes", async () => {
  const pending = defer();
  server.use(http.get(`${base}/class-123/members/b/mastery`, async () => { await pending.promise; return json(rawTutorMastery("class-123", "b").replace("Actual zero", "Member B topic")); }));
  render(<TutorProgressPanel classId="class-123" revision={0} />); await select(); await screen.findByText(`${preciseMasteryScore}% · DEVELOPING`);
  await select("b");
  expect(screen.queryByText(`${preciseMasteryScore}% · DEVELOPING`)).not.toBeInTheDocument();
  await screen.findByText("Loading topic mastery…");
  expect(screen.getByText("Student b")).toBeInTheDocument();
  await act(async () => pending.finish());
  expect(await screen.findByText("Member B topic:")).toBeInTheDocument();
});

it("invalidates mastery on Class change and waits for a new active-member selection", async () => {
  const ui = render(<TutorProgressPanel classId="class-123" revision={0} />); await select(); await screen.findByText(`${preciseMasteryScore}% · DEVELOPING`);
  ui.rerender(<TutorProgressPanel classId="other-class" revision={0} />);
  expect(screen.queryByText(`${preciseMasteryScore}% · DEVELOPING`)).not.toBeInTheDocument();
  await screen.findByRole("button", { name: /Learner a/ });
  expect(seen.some(path => path.startsWith("/api/v1/tutor/classes/other-class/members/"))).toBe(false);
  await select(); await screen.findByText(`${preciseMasteryScore}% · DEVELOPING`);
  expect(seen).toContain("/api/v1/tutor/classes/other-class/members/a/mastery");
});

it("removes mastery on parent reload and does not request a removed member", async () => {
  const ui = render(<TutorProgressPanel classId="class-123" revision={0} />); await select(); await screen.findByText(`${preciseMasteryScore}% · DEVELOPING`);
  const roster = tutorProgress(); roster.members = roster.members.filter(member => member.class_member_id !== "a");
  server.use(http.get(`${base}/class-123/progress`, () => HttpResponse.json(roster)));
  ui.rerender(<TutorProgressPanel classId="class-123" revision={1} />);
  expect(screen.queryByText(`${preciseMasteryScore}% · DEVELOPING`)).not.toBeInTheDocument();
  await screen.findByRole("button", { name: /Learner b/ });
  expect(screen.queryByRole("button", { name: /Learner a/ })).not.toBeInTheDocument();
  expect(screen.queryByText("Student a")).not.toBeInTheDocument();
  expect(seen.filter(path => path.endsWith("/mastery"))).toHaveLength(1);
});

it("reloads mastery for a still-active member and hides the old result while loading", async () => {
  const pending = defer();
  const ui = render(<TutorProgressPanel classId="class-123" revision={0} />); await select(); await screen.findByText(`${preciseMasteryScore}% · DEVELOPING`);
  server.use(http.get(endpoint, async () => { await pending.promise; return json(rawTutorMastery().replace("Actual zero", "Refreshed topic")); }));
  ui.rerender(<TutorProgressPanel classId="class-123" revision={1} />);
  expect(screen.queryByText(`${preciseMasteryScore}% · DEVELOPING`)).not.toBeInTheDocument();
  await screen.findByText("Loading topic mastery…");
  await act(async () => pending.finish());
  expect(await screen.findByText("Refreshed topic:")).toBeInTheDocument();
  expect(seen.filter(path => path.endsWith("/mastery"))).toHaveLength(2);
});

it("ignores an out-of-order result after switching selected members", async () => {
  const pending = defer();
  server.use(http.get(endpoint, async () => { await pending.promise; return json(rawTutorMastery().replace("Actual zero", "Stale topic A")); }),
    http.get(`${base}/class-123/members/b/mastery`, () => json(rawTutorMastery("class-123", "b").replace("Actual zero", "Current topic B"))));
  render(<TutorProgressPanel classId="class-123" revision={0} />); await select(); await screen.findByText("Loading topic mastery…");
  await select("b"); await screen.findByText("Current topic B:");
  await act(async () => pending.finish());
  expect(screen.queryByText("Stale topic A:")).not.toBeInTheDocument();
  expect(screen.getByText("Student b")).toBeInTheDocument();
});

it("does not invalidate the current selection for a late rejected request from another member", async () => {
  const pending = defer();
  server.use(http.get(endpoint, async () => { await pending.promise; return HttpResponse.json({ message: "Old member denied", code: "FORBIDDEN", details: [] }, { status: 403 }); }));
  render(<TutorProgressPanel classId="class-123" revision={0} />); await select(); await screen.findByText("Loading topic mastery…");
  await select("b"); await screen.findByText(`${preciseMasteryScore}% · DEVELOPING`);
  await act(async () => pending.finish());
  expect(screen.getByText("Student b")).toBeInTheDocument();
  expect(screen.queryByText("Student mastery is unavailable")).not.toBeInTheDocument();
});

it("cancels an in-flight mastery request on unmount", async () => {
  const pending = defer(); let requestSignal: AbortSignal | undefined;
  server.use(http.get(endpoint, async ({ request }) => { requestSignal = request.signal; await pending.promise; return json(rawTutorMastery()); }));
  const ui = render(<TutorProgressPanel classId="class-123" revision={0} />); await select();
  await screen.findByText("Loading topic mastery…");
  await waitFor(() => expect(requestSignal).toBeDefined());
  ui.unmount(); await waitFor(() => expect(requestSignal?.aborted).toBe(true));
  await act(async () => pending.finish());
  expect(screen.queryByText(`${preciseMasteryScore}% · DEVELOPING`)).not.toBeInTheDocument();
});
