import type { MasteryLevel } from "@/types/mastery";

/** LMS-9 display model. Scores are exact JSON decimal tokens, never JS numbers. */
export type TutorTopicMastery = { skill_topic_id: string; name: string } & (
  | { evidence_available: true; mastery_score: string; mastery_level: MasteryLevel }
  | { evidence_available: false; mastery_score: null; mastery_level: null }
);

export interface TutorMasteryResponse {
  class_id: string;
  class_member_id: string;
  items: TutorTopicMastery[];
}
