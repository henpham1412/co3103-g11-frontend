// DiscussionResponse carries author_id only. The class detail supplies the tutor's name and the
// authenticated profile supplies the reader's own, so those two are the only real names available
// without a new endpoint. Everyone else gets a neutral label instead of a raw UUID.
export const NEUTRAL_AUTHOR_LABEL = "Class member";

export interface DiscussionAuthorContext {
  currentUserId?: string;
  currentUserFullName?: string;
  tutorUserId?: string;
  tutorFullName?: string;
}

export function discussionAuthorLabel(authorId: string, context: DiscussionAuthorContext): string {
  if (context.currentUserId && authorId === context.currentUserId) {
    return context.currentUserFullName?.trim() || "You";
  }
  if (context.tutorUserId && authorId === context.tutorUserId) {
    return context.tutorFullName?.trim() || NEUTRAL_AUTHOR_LABEL;
  }
  return NEUTRAL_AUTHOR_LABEL;
}