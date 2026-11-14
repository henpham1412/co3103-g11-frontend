// Mirrors DiscussionService: a root title is required, a reply title may be absent, both are
// trimmed and capped at 255 characters, and a body is stored exactly as written.
export const DISCUSSION_TITLE_MAX_LENGTH = 255;

export function validateDiscussionTitle(value: string, required: boolean): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return required ? "Enter a title for this post." : undefined;
  if (trimmed.length > DISCUSSION_TITLE_MAX_LENGTH) {
    return `Keep the title to ${DISCUSSION_TITLE_MAX_LENGTH} characters or fewer.`;
  }
  return undefined;
}

export function validateDiscussionContent(value: string): string | undefined {
  return value.trim() ? undefined : "Write a message before posting.";
}

// An empty optional title must be omitted: the server rejects a blank one.
export function optionalDiscussionTitle(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}