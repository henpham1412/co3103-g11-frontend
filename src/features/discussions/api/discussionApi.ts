import { lmsClient } from "../../../api/lmsClient";
import type {
  CreateDiscussionInput,
  CreateReplyInput,
  DiscussionPage,
  DiscussionPost,
  UpdateDiscussionInput,
} from "../types";

export interface DiscussionListQuery {
  lesson_id?: string;
  page?: number;
  size?: number;
}

export async function listClassDiscussions(
  classId: string,
  query: DiscussionListQuery = {},
  signal?: AbortSignal,
): Promise<DiscussionPage> {
  const response = await lmsClient.get<DiscussionPage>(`/classes/${classId}/discussions`, {
    params: query,
    signal,
  });
  return response.data;
}

export async function getDiscussion(
  discussionId: string,
  signal?: AbortSignal,
): Promise<DiscussionPost> {
  const response = await lmsClient.get<DiscussionPost>(`/discussions/${discussionId}`, { signal });
  return response.data;
}

export async function createDiscussion(
  classId: string,
  input: CreateDiscussionInput,
): Promise<DiscussionPost> {
  const response = await lmsClient.post<DiscussionPost>(`/classes/${classId}/discussions`, input);
  return response.data;
}

export async function createReply(
  discussionId: string,
  input: CreateReplyInput,
): Promise<DiscussionPost> {
  const response = await lmsClient.post<DiscussionPost>(`/discussions/${discussionId}/replies`, input);
  return response.data;
}

export async function updateDiscussion(
  discussionId: string,
  input: UpdateDiscussionInput,
): Promise<DiscussionPost> {
  const response = await lmsClient.patch<DiscussionPost>(`/discussions/${discussionId}`, input);
  return response.data;
}

export async function deleteDiscussion(discussionId: string): Promise<void> {
  await lmsClient.delete(`/discussions/${discussionId}`);
}