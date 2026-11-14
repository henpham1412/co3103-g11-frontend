import { describe, expect, it } from "vitest";

import { NEUTRAL_AUTHOR_LABEL, discussionAuthorLabel } from "./authorLabel";

describe("discussion author label", () => {
  const context = {
    currentUserId: "u-me",
    currentUserFullName: "Nguyen Van A",
    tutorUserId: "u-tutor",
    tutorFullName: "Dr. Tran Thi B",
  };

  it("shows the reader their own profile name", () => {
    expect(discussionAuthorLabel("u-me", context)).toBe("Nguyen Van A");
  });

  it("shows the class tutor name from the class detail", () => {
    expect(discussionAuthorLabel("u-tutor", context)).toBe("Dr. Tran Thi B");
  });

  it("labels another student neutrally instead of exposing the author UUID", () => {
    expect(discussionAuthorLabel("u-other", context)).toBe(NEUTRAL_AUTHOR_LABEL);
    expect(discussionAuthorLabel("u-other", context)).not.toContain("u-other");
  });

  it("falls back when the profile or class detail has no name yet", () => {
    expect(discussionAuthorLabel("u-me", { ...context, currentUserFullName: "  " })).toBe("You");
    expect(discussionAuthorLabel("u-tutor", { ...context, tutorFullName: undefined })).toBe(NEUTRAL_AUTHOR_LABEL);
  });

  it("stays neutral when neither identity is known", () => {
    expect(discussionAuthorLabel("u-me", {})).toBe(NEUTRAL_AUTHOR_LABEL);
    expect(discussionAuthorLabel("u-tutor", {})).toBe(NEUTRAL_AUTHOR_LABEL);
  });
});