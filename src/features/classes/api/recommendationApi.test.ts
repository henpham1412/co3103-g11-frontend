import { afterEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { recommendation } from "@/test/fixtures/recommendation";
import { authSession } from "@/test/fixtures/auth";
import { lmsClient } from "@/api/lmsClient";
import { installAuthInterceptors } from "@/api/authInterceptors";
import { getRecommendedActivities } from "./recommendationApi";

const endpoint = "http://localhost:8081/api/v1/classes/class-123/recommended-activities";
let uninstall: (() => void) | undefined;
afterEach(() => { uninstall?.(); uninstall = undefined; });

it("uses the authenticated LMS client, exact relative route, and canonical nullable topic contract", async () => {
  const session = authSession({ accessToken: "student-token" });
  // Reuse the installed interceptors; recommendation supplies no learner selector or auth implementation.
  uninstall = installAuthInterceptors({ getSessionSnapshot: () => ({ session, generation: 1 }), purgeSession: vi.fn(), onLmsForbidden: vi.fn() });
  server.use(http.get(endpoint, ({ request }) => {
    expect(request.headers.get("Authorization")).toBe("Bearer student-token");
    expect(new URL(request.url).search).toBe(""); return HttpResponse.json(recommendation());
  }));
  const response = await getRecommendedActivities("class-123");
  expect(response).toEqual(recommendation());
  expect(response.recommendation?.skill_topics[1].mastery_level).toBeNull();
  expect(response.recommendation?.skill_topics[1]).not.toHaveProperty("mastery_score");
  expect(lmsClient.defaults.baseURL).toContain("/api/v1");
});

it.each(["NO_ELIGIBLE_ACTIVITY", "CLASS_ARCHIVED"])("keeps successful null responses distinct from errors: %s", async reason => {
  const body = { class_id: "class-123", recommendation: null, reason };
  server.use(http.get(endpoint, () => HttpResponse.json(body)));
  expect(await getRecommendedActivities("class-123")).toEqual(body);
});

it.each([401, 403, 404, 500])("propagates HTTP errors instead of fabricating empty evidence (%s)", async status => {
  server.use(http.get(endpoint, () => HttpResponse.json({ code: "UNAVAILABLE", message: "Read denied", details: [] }, { status })));
  await expect(getRecommendedActivities("class-123")).rejects.toMatchObject({ response: { status } });
});

it("supports request cancellation", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(getRecommendedActivities("class-123", controller.signal)).rejects.toMatchObject({ code: "ERR_CANCELED" });
});

it.each(["foreign-class", "unsupported-type", "unknown-level", "missing-reason"])("rejects malformed or foreign response data (%s)", async variant => {
  const data = recommendation();
  const body = structuredClone(data) as unknown as Record<string, unknown>;
  if (variant === "foreign-class") body.class_id = "other-class";
  else if (variant === "missing-reason") { body.recommendation = null; }
  else {
    const candidate = body.recommendation as Record<string, unknown>;
    if (variant === "unsupported-type") candidate.activity_type = "ASSIGNMENT";
    else candidate.skill_topics = [{ skill_topic_id: "topic", name: "Topic", mastery_level: "UNKNOWN" }];
  }
  server.use(http.get(endpoint, () => HttpResponse.json(body)));
  await expect(getRecommendedActivities("class-123")).rejects.toThrow("invalid or unsupported");
});
