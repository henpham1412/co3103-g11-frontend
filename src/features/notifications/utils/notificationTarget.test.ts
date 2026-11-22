import { describe, expect, it } from "vitest";

import { isSafeInternalTargetUrl, resolveNotificationTarget } from "./notificationTarget";

describe("notificationTarget", () => {
  it("accepts safe internal LMS paths and rejects external or unsafe URLs", () => {
    expect(isSafeInternalTargetUrl("/classes/c1")).toBe(true);
    expect(isSafeInternalTargetUrl("/assessment-history")).toBe(true);
    expect(isSafeInternalTargetUrl("/tutor/discussion")).toBe(true);

    expect(isSafeInternalTargetUrl(null)).toBe(false);
    expect(isSafeInternalTargetUrl("")).toBe(false);
    expect(isSafeInternalTargetUrl("https://evil.example/phish")).toBe(false);
    expect(isSafeInternalTargetUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeInternalTargetUrl("//evil.example/path")).toBe(false);
    expect(isSafeInternalTargetUrl("/classes\\evil")).toBe(false);
  });

  it("falls back to Tutor class content when assignment grading route is not mounted yet (D3)", () => {
    const gradingUrl = "/tutor/classes/class-9/content/assignment/act-42/grade";
    const resolved = resolveNotificationTarget(gradingUrl, () => false);
    expect(resolved).toEqual({
      href: "/tutor/classes/class-9/content",
      isFallback: true,
      fallbackNotice: "Direct assignment grading navigation is not yet available; opening class content instead.",
    });
  });

  it("uses the exact backend assignment grading target_url once the FE-7 grading route exists (D3)", () => {
    const gradingUrl = "/tutor/classes/class-9/content/assignment/act-42/grade";
    const resolved = resolveNotificationTarget(gradingUrl, (path) => path === gradingUrl);
    expect(resolved).toEqual({
      href: gradingUrl,
      isFallback: false,
    });
  });

  it("returns exact target_url without fallback for all existing routes", () => {
    for (const url of [
      "/classes/c1",
      "/classes/c1/lessons/l1",
      "/classes/c1/lessons/l1/activities/a1",
      "/assessment-history",
      "/discussion",
      "/tutor/discussion",
    ]) {
      expect(resolveNotificationTarget(url, () => true)).toEqual({ href: url, isFallback: false });
    }
  });
});
