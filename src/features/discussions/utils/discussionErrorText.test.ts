import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { discussionErrorText, isStaleDiscussionState } from "./discussionErrorText";

function apiError(status: number, code?: string, message = "Server message"): ApiError {
  return new ApiError({ status, error: "Error", message, code, timestamp: "", path: "" });
}

describe("discussion error text", () => {
  it("translates the codes the discussion and report endpoints return", () => {
    expect(discussionErrorText(apiError(403, "FORBIDDEN"))).toBe(
      "You need an active membership in this class to read or post here.",
    );
    expect(discussionErrorText(apiError(409, "DUPLICATE_CONTENT_REPORT"))).toBe(
      "You have already reported this content.",
    );
    expect(discussionErrorText(apiError(409, "DISCUSSION_HAS_REPLIES"))).toBe(
      "This post still has replies, so the server keeps it.",
    );
    expect(discussionErrorText(apiError(409, "DISCUSSION_HAS_UNRESOLVED_REPORT"))).toBe(
      "This post has an open content report, so it cannot be deleted yet.",
    );
  });

  it("falls back to the status meaning when the server sent no known code", () => {
    expect(discussionErrorText(apiError(403))).toBe(
      "You need an active membership in this class to read or post here.",
    );
    expect(discussionErrorText(apiError(401))).toBe("Your session expired. Sign in again to continue.");
  });

  it("keeps the server message for an unmapped code", () => {
    expect(discussionErrorText(apiError(500, "SOMETHING_ELSE", "Try again later."))).toBe("Try again later.");
  });

  it("marks the states that require re-reading the discussion", () => {
    expect(isStaleDiscussionState(apiError(404, "DISCUSSION_NOT_FOUND"))).toBe(true);
    expect(isStaleDiscussionState(apiError(409, "DISCUSSION_HAS_REPLIES"))).toBe(true);
    expect(isStaleDiscussionState(apiError(404, "REPORTED_CONTENT_NOT_FOUND"))).toBe(true);
    expect(isStaleDiscussionState(apiError(409, "DUPLICATE_CONTENT_REPORT"))).toBe(false);
    expect(isStaleDiscussionState(apiError(403, "FORBIDDEN"))).toBe(false);
  });
});