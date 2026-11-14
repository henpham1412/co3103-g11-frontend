/** Raw JSON is intentional: JS numeric fixtures would destroy the precision under test. */
export const preciseMasteryScore = "79.99999999999999999999999999999999";

export function rawTutorMastery(classId = "class-123", memberId = "a") {
  return `{
    "class_id": ${JSON.stringify(classId)}, "class_member_id": ${JSON.stringify(memberId)},
    "items": [
      {"skill_topic_id":"zero","name":"Actual zero","mastery_score":0,"mastery_level":"WEAK","evidence_available":true},
      {"skill_topic_id":"boundary","name":"Boundary","mastery_score":${preciseMasteryScore},"mastery_level":"DEVELOPING","evidence_available":true},
      {"skill_topic_id":"missing","name":"Collections","mastery_score":null,"mastery_level":null,"evidence_available":false},
      {"skill_topic_id":"syntax","name":"Syntax","mastery_score":85.5,"mastery_level":"SUFFICIENT","evidence_available":true}
    ]
  }`;
}

export function rawSingleMastery(score: string, level = "DEVELOPING") {
  return `{"class_id":"class-123","class_member_id":"a","items":[{"skill_topic_id":"topic","name":"Topic","mastery_score":${score},"mastery_level":"${level}","evidence_available":true}]}`;
}
