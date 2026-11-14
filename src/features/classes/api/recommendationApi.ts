import { lmsClient } from "@/api/lmsClient";
import { isNonEmptyString, isRecord } from "@/utils/typeGuards";
import type { RecommendedActivitiesResponse, RecommendedActivity } from "../recommendation-types";

/** Reads only the authenticated Student's recommendation; no learner selector or mutation. */
export async function getRecommendedActivities(classId: string, signal?: AbortSignal): Promise<RecommendedActivitiesResponse> {
  const { data } = await lmsClient.get<unknown>(`/classes/${classId}/recommended-activities`, { signal });
  const invalid = () => new Error("The recommendation response is invalid or unsupported. Refresh and try again.");
  if (!isRecord(data) || data.class_id !== classId) throw invalid();
  if (data.recommendation === null) {
    if (data.reason !== "NO_ELIGIBLE_ACTIVITY" && data.reason !== "CLASS_ARCHIVED") throw invalid();
    return { class_id: classId, recommendation: null, reason: data.reason };
  }
  const candidate = data.recommendation;
  if (!isRecord(candidate) || candidate.activity_type !== "QUIZ" || !isNonEmptyString(candidate.activity_id)
      || !isNonEmptyString(candidate.title) || !Array.isArray(candidate.skill_topics)
      || (candidate.reason !== "ADDITIONAL_PRACTICE" && candidate.reason !== "NORMAL_SEQUENCE")) throw invalid();
  const topics = candidate.skill_topics.map((topic: unknown): RecommendedActivity["skill_topics"][number] => {
    if (!isRecord(topic) || !isNonEmptyString(topic.skill_topic_id) || !isNonEmptyString(topic.name)
        || (topic.mastery_level !== null && topic.mastery_level !== "WEAK"
          && topic.mastery_level !== "DEVELOPING" && topic.mastery_level !== "SUFFICIENT")) throw invalid();
    return { skill_topic_id: topic.skill_topic_id, name: topic.name, mastery_level: topic.mastery_level };
  });
  return { class_id: classId, recommendation: {
    activity_id: candidate.activity_id, activity_type: "QUIZ", title: candidate.title,
    reason: candidate.reason, skill_topics: topics,
  } };
}
