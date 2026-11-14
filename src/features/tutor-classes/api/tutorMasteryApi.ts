import { compareLosslessNumber, isLosslessNumber, LosslessNumber, parse } from "lossless-json";
import { lmsClient } from "@/api/lmsClient";
import { normalizeApiError } from "@/api/apiError";
import { isNonEmptyString, isRecord } from "@/utils/typeGuards";
import type { TutorMasteryResponse, TutorTopicMastery } from "../mastery-types";

const zero = new LosslessNumber("0");
const hundred = new LosslessNumber("100");

/** Endpoint-only transform: the fetch adapter must supply raw text, not parsed numbers. */
function readLosslessJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try { return parse(raw); }
  // Retain HTTP status/auth handling even when an error response isn't valid JSON.
  catch { return raw; }
}

function validateMastery(data: unknown, classId: string, memberId: string): TutorMasteryResponse {
  const invalid = () => new Error("The mastery response is invalid or unsupported. Refresh and try again.");
  if (!isRecord(data) || data.class_id !== classId || data.class_member_id !== memberId || !Array.isArray(data.items)) throw invalid();
  const seen = new Set<string>();
  const items = data.items.map((item: unknown): TutorTopicMastery => {
    if (!isRecord(item) || !isNonEmptyString(item.skill_topic_id) || !isNonEmptyString(item.name) || seen.has(item.skill_topic_id)) throw invalid();
    seen.add(item.skill_topic_id);
    const topic = { skill_topic_id: item.skill_topic_id, name: item.name };
    if (item.evidence_available === false && item.mastery_score === null && item.mastery_level === null)
      return { ...topic, evidence_available: false, mastery_score: null, mastery_level: null };
    if (item.evidence_available !== true || !isLosslessNumber(item.mastery_score)
      || compareLosslessNumber(item.mastery_score, zero) < 0 || compareLosslessNumber(item.mastery_score, hundred) > 0
      || (item.mastery_level !== "WEAK" && item.mastery_level !== "DEVELOPING" && item.mastery_level !== "SUFFICIENT")) throw invalid();
    return { ...topic, evidence_available: true, mastery_score: item.mastery_score.value, mastery_level: item.mastery_level };
  });
  return { class_id: classId, class_member_id: memberId, items };
}

export async function getTutorMastery(classId: string, memberId: string, signal?: AbortSignal): Promise<TutorMasteryResponse> {
  try {
    const { data } = await lmsClient.get<unknown>(`/tutor/classes/${classId}/members/${memberId}/mastery`, {
      signal, responseType: "text", transformResponse: [readLosslessJson],
    });
    return validateMastery(data, classId, memberId);
  } catch (cause) { throw normalizeApiError(cause); }
}
