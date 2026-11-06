import { sampleClasses } from "../../classes/data/mockClasses";
import type {
  CreateTutorClass,
  TutorClass,
  TutorClassPage,
  TutorMember,
  TutorMemberPage,
} from "../types";

const classes = new Map<string, TutorClass>(sampleClasses.map((item, index) => [item.class_id, {
  class_id: item.class_id,
  tutor_id: item.tutor.user_id,
  class_code: item.class_code,
  title: item.title,
  description: item.description,
  prerequisites_description: item.prerequisites_description,
  max_capacity: item.max_capacity,
  enrollment_policy: item.enrollment_policy,
  status: item.status,
  thumbnail_url: item.thumbnail_url,
  created_at: new Date(Date.UTC(2026, 9, 20 - index)).toISOString(),
  updated_at: new Date(Date.UTC(2026, 9, 20 - index)).toISOString(),
}]));

const members = new Map<string, TutorMember[]>(sampleClasses.map((item) => [item.class_id, [
  { class_member_id: `demo-active-${item.class_id}`, class_id: item.class_id, student_id: "student-olivia", status: "ACTIVE", requested_at: null, joined_at: "2026-10-05T09:00:00Z" },
  { class_member_id: `demo-pending-${item.class_id}`, class_id: item.class_id, student_id: "student-maya", status: "PENDING", requested_at: "2026-10-15T03:24:00Z", joined_at: null },
]]));

export function getDemoTutorClasses(query: { page?: number; size?: number; sort?: string } = {}): TutorClassPage {
  const items = [...classes.values()];
  if (query.sort === "created_at,asc") items.reverse();
  else items.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const page = Math.max(1, query.page ?? 1);
  const size = Math.max(1, query.size ?? 20);
  return { items: items.slice((page - 1) * size, page * size), page, size, total_items: items.length, total_pages: Math.ceil(items.length / size) };
}

export function createDemoTutorClass(payload: CreateTutorClass): TutorClass {
  const now = new Date().toISOString();
  const classId = `demo-class-${Date.now()}`;
  const created: TutorClass = {
    class_id: classId,
    tutor_id: "demo-tutor",
    class_code: payload.class_code,
    title: payload.title,
    description: payload.description ?? null,
    prerequisites_description: payload.prerequisites_description ?? null,
    max_capacity: payload.max_capacity ?? null,
    enrollment_policy: payload.enrollment_policy,
    status: "ACTIVE",
    thumbnail_url: null,
    created_at: now,
    updated_at: now,
  };
  classes.set(classId, created);
  members.set(classId, []);
  return created;
}

export function updateDemoTutorClass(classId: string, payload: Partial<Pick<TutorClass, "title" | "description" | "prerequisites_description" | "max_capacity" | "status">> & { enrollment_policy?: TutorClass["enrollment_policy"] }) {
  const current = classes.get(classId);
  if (!current) throw new Error("Demo class not found.");
  const updated = { ...current, ...payload, updated_at: new Date().toISOString() };
  classes.set(classId, updated);
  return updated;
}

export function getDemoTutorClassMembers(classId: string, query: { status?: "PENDING" | "ACTIVE"; page?: number; size?: number } = {}): TutorMemberPage {
  let items = members.get(classId) ?? [];
  if (query.status) items = items.filter((item) => item.status === query.status);
  const page = Math.max(1, query.page ?? 1);
  const size = Math.max(1, query.size ?? 20);
  return { items: items.slice((page - 1) * size, page * size), page, size, total_items: items.length, total_pages: Math.ceil(items.length / size) };
}

export function updateDemoTutorMember(classId: string, memberId: string, action: "approve" | "reject" | "remove") {
  const list = members.get(classId) ?? [];
  const member = list.find((item) => item.class_member_id === memberId);
  if (!member) throw new Error("Demo membership not found.");
  if (action === "remove" || action === "reject") {
    members.set(classId, list.filter((item) => item.class_member_id !== memberId));
  } else {
    member.status = "ACTIVE";
    member.joined_at = new Date().toISOString();
    member.requested_at = null;
  }
}
