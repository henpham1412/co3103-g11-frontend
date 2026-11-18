import { describe, expect, it } from "vitest";

import {
  DISCUSSION_TITLE_MAX_LENGTH,
  optionalDiscussionTitle,
  validateDiscussionContent,
  validateDiscussionTitle,
} from "./discussionValidation";

describe("discussion validation", () => {
  it("requires a root title and caps it at the server limit", () => {
    expect(validateDiscussionTitle("   ", true)).toBe("Enter a title for this post.");
    expect(validateDiscussionTitle("Week 1", true)).toBeUndefined();
    expect(validateDiscussionTitle("a".repeat(DISCUSSION_TITLE_MAX_LENGTH), true)).toBeUndefined();
    expect(validateDiscussionTitle("a".repeat(DISCUSSION_TITLE_MAX_LENGTH + 1), true))
      .toBe("Keep the title to 255 characters or fewer.");
  });

  it("allows an absent reply title but still rejects an over-long one", () => {
    expect(validateDiscussionTitle("", false)).toBeUndefined();
    expect(validateDiscussionTitle("a".repeat(256), false)).toBe("Keep the title to 255 characters or fewer.");
  });

  it("counts the trimmed title, matching the server-side length check", () => {
    expect(validateDiscussionTitle(`  ${"a".repeat(255)}  `, true)).toBeUndefined();
    expect(validateDiscussionTitle(`  ${"a".repeat(256)}  `, true)).toBe("Keep the title to 255 characters or fewer.");
  });

  it("rejects an empty body but keeps a body with surrounding whitespace", () => {
    expect(validateDiscussionContent("")).toBe("Write a message before posting.");
    expect(validateDiscussionContent(" \n\t ")).toBe("Write a message before posting.");
    expect(validateDiscussionContent(" Question ")).toBeUndefined();
  });

  it("drops a blank optional title so the payload omits it", () => {
    expect(optionalDiscussionTitle("   ")).toBeUndefined();
    expect(optionalDiscussionTitle("")).toBeUndefined();
    expect(optionalDiscussionTitle("  Re: Week 1  ")).toBe("Re: Week 1");
  });
});