import type { MasteryLevel } from "@/types/mastery";

export interface RecommendedActivity {
  activity_id: string;
  activity_type: "QUIZ";
  title: string;
  reason: "ADDITIONAL_PRACTICE" | "NORMAL_SEQUENCE";
  skill_topics: { skill_topic_id: string; name: string; mastery_level: MasteryLevel | null }[];
}

export type RecommendedActivitiesResponse =
  | { class_id: string; recommendation: RecommendedActivity; reason?: never }
  | { class_id: string; recommendation: null; reason: "NO_ELIGIBLE_ACTIVITY" | "CLASS_ARCHIVED" };
