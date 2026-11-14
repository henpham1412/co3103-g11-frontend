import { afterEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { authSession } from "@/test/fixtures/auth";
import { preciseMasteryScore, rawSingleMastery, rawTutorMastery } from "@/test/fixtures/tutorMastery";
import { installAuthInterceptors } from "@/api/authInterceptors";
import { lmsClient } from "@/api/lmsClient";
import { getTutorMastery } from "./tutorMasteryApi";

const endpoint = "http://localhost:8081/api/v1/tutor/classes/class-123/members/a/mastery";
const json = (text: string) => new HttpResponse(text, { headers: { "Content-Type": "application/json" } });
let uninstall: (() => void) | undefined;
afterEach(() => { uninstall?.(); uninstall = undefined; });

it("uses the authenticated LMS route and retains backend item order and distinct evidence states", async () => {
  const session = authSession({ accessToken: "tutor-token" });
  uninstall = installAuthInterceptors({ getSessionSnapshot: () => ({ session, generation: 1 }), purgeSession: vi.fn(), onLmsForbidden: vi.fn() });
  server.use(http.get(endpoint, ({ request }) => {
    expect(request.headers.get("Authorization")).toBe("Bearer tutor-token");
    expect(new URL(request.url).search).toBe(""); return json(rawTutorMastery());
  }));
  const response = await getTutorMastery("class-123", "a");
  expect(response.class_id).toBe("class-123"); expect(response.class_member_id).toBe("a");
  expect(response.items.map(item => item.name)).toEqual(["Actual zero", "Boundary", "Collections", "Syntax"]);
  expect(response.items[0]).toMatchObject({ mastery_score: "0", mastery_level: "WEAK", evidence_available: true });
  expect(response.items[1]).toMatchObject({ mastery_score: preciseMasteryScore, mastery_level: "DEVELOPING" });
  expect(response.items[2]).toMatchObject({ mastery_score: null, mastery_level: null, evidence_available: false });
});

it.each(["0", "85.5", preciseMasteryScore, "0.00", "8.55E+1", "1E-30"])("preserves the exact raw decimal token %s", async score => {
  server.use(http.get(endpoint, () => json(rawSingleMastery(score))));
  expect((await getTutorMastery("class-123", "a")).items[0].mastery_score).toBe(score);
});

it("accepts a genuine empty topic list", async () => {
  server.use(http.get(endpoint, () => json('{"class_id":"class-123","class_member_id":"a","items":[]}')));
  expect((await getTutorMastery("class-123", "a")).items).toEqual([]);
});

it("supports cancellation without producing empty data", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(getTutorMastery("class-123", "a", controller.signal)).rejects.toMatchObject({ code: "ERR_CANCELED" });
});

it.each([401, 403, 404, 500])("retains the common HTTP error envelope (%s)", async status => {
  server.use(http.get(endpoint, () => HttpResponse.json({ code: "CLASS_OR_MEMBER_NOT_FOUND", message: "Member read denied", details: [{ field: "member", message: "Unavailable" }] }, { status })));
  await expect(getTutorMastery("class-123", "a")).rejects.toMatchObject({ status, code: "CLASS_OR_MEMBER_NOT_FOUND", message: "Member read denied", details: [{ field: "member", message: "Unavailable" }] });
});

it.each([401, 403])("preserves existing session/auth interceptor handling (%s)", async status => {
  const session = authSession(); const purgeSession = vi.fn(); const onLmsForbidden = vi.fn();
  uninstall = installAuthInterceptors({ getSessionSnapshot: () => ({ session, generation: 7 }), purgeSession, onLmsForbidden });
  server.use(http.get(endpoint, () => new HttpResponse("Access rejected", { status })));
  await expect(getTutorMastery("class-123", "a")).rejects.toMatchObject({ status });
  if (status === 401) { expect(purgeSession).toHaveBeenCalledWith("unauthorized", 7); expect(onLmsForbidden).not.toHaveBeenCalled(); }
  else { expect(onLmsForbidden).toHaveBeenCalledOnce(); expect(purgeSession).not.toHaveBeenCalled(); }
});

it.each([
  ['"class_id":"class-123"', '"class_id":"foreign"'],
  ['"class_member_id":"a"', '"class_member_id":"b"'],
  ['"mastery_score":50', '"mastery_score":"50"'],
  ['"mastery_score":50', '"mastery_score":null'],
  ['"mastery_score":50', '"mastery_score":-1'],
  ['"mastery_score":50', '"mastery_score":100.00000000000000000000000000000001'],
  ['"mastery_level":"DEVELOPING"', '"mastery_level":"UNKNOWN"'],
  ['"mastery_level":"DEVELOPING"', '"mastery_level":null'],
  ['"evidence_available":true', '"evidence_available":false'],
  ['"evidence_available":true', '"evidence_available":null'],
  ['"skill_topic_id":"topic"', '"skill_topic_id":""'],
])("rejects invalid identity, score or evidence fields (%s → %s)", async (before, after) => {
  server.use(http.get(endpoint, () => json(rawSingleMastery("50").replace(before, after))));
  await expect(getTutorMastery("class-123", "a")).rejects.toThrow();
});

it.each([
  '{"class_id":"class-123","class_member_id":"a","items":null}',
  rawTutorMastery().replace('"skill_topic_id":"boundary"', '"skill_topic_id":"zero"'),
  rawTutorMastery().replace('"mastery_score":null', '"mastery_score":0'),
  rawTutorMastery().replace('"mastery_level":null', '"mastery_level":"WEAK"'),
  "not json",
])("rejects malformed/duplicate/inconsistent responses rather than fabricating empty topics", async raw => {
  server.use(http.get(endpoint, () => json(raw)));
  await expect(getTutorMastery("class-123", "a")).rejects.toThrow();
});

it("does not change global Axios parsing or another LMS endpoint", async () => {
  const transform = lmsClient.defaults.transformResponse;
  server.use(http.get(endpoint, () => json(rawTutorMastery())),
    http.get("http://localhost:8081/api/v1/ordinary-response", () => json(`{"score":${preciseMasteryScore}}`)));
  expect((await getTutorMastery("class-123", "a")).items[1].mastery_score).toBe(preciseMasteryScore);
  expect(lmsClient.defaults.transformResponse).toBe(transform);
  expect((await lmsClient.get("/ordinary-response")).data).toEqual({ score: 80 });
});
