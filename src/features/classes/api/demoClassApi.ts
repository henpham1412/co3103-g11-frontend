import { sampleClasses } from "../data/mockClasses";
import { mockClassDetails } from "../data/mockClassDetails";
import type {
  ClassCatalogItem,
  ClassCatalogResponse,
  ClassOutlineResponse,
  CurrentMembership,
  EnrollmentPolicy,
  MembershipActionResponse,
  MembershipStatus,
} from "../types";
import type { ClassCatalogQuery } from "./classApi";

const demoMemberships = new Map<string, MembershipStatus>(
  sampleClasses.flatMap((item) => item.membership === "NONE"
    ? []
    : [[item.class_id, item.membership] as [string, MembershipStatus]]),
);

const demoLessons = [
  ["Welcome to programming", "Variables and data types", "Working with values"],
  ["Conditions and decisions", "Loops and iteration", "Practicing control flow"],
  ["Functions and parameters", "Return values and scope", "Reusable programs"],
];

export function getDemoCatalog(query: ClassCatalogQuery = {}): ClassCatalogResponse {
  const search = query.q?.trim().toLowerCase();
  let items: ClassCatalogItem[] = sampleClasses.filter((item) =>
    (!search || `${item.title} ${item.class_code} ${item.tutor.full_name}`.toLowerCase().includes(search))
    && (!query.enrollment_policy || item.enrollment_policy === query.enrollment_policy),
  );
  if (query.sort === "title,asc") items = [...items].sort((a, b) => a.title.localeCompare(b.title));
  else if (query.sort === "title,desc") items = [...items].sort((a, b) => b.title.localeCompare(a.title));
  else if (query.sort === "created_at,asc") items = [...items].reverse();

  const page = Math.max(1, query.page ?? 1);
  const size = Math.max(1, query.size ?? 12);
  const totalItems = items.length;
  return {
    items: items.slice((page - 1) * size, page * size),
    page,
    size,
    total_items: totalItems,
    total_pages: Math.ceil(totalItems / size),
  };
}

export function getDemoMemberships(): CurrentMembership[] {
  return [...demoMemberships].map(([class_id, status]) => ({ class_id, status }));
}

export function joinDemoClass(classId: string, policy: EnrollmentPolicy): MembershipActionResponse {
  const status: MembershipStatus = policy === "OPEN" ? "ACTIVE" : "PENDING";
  demoMemberships.set(classId, status);
  return { class_member_id: `demo-member-${classId}`, class_id: classId, status };
}

export function endDemoMembership(classId: string) {
  demoMemberships.delete(classId);
}

export function getDemoClass(classId: string): ClassCatalogItem {
  const item = sampleClasses.find(({ class_id }) => class_id === classId);
  if (!item) throw new Error("Demo class not found.");
  return item;
}

export function getDemoOutline(classId: string): ClassOutlineResponse {
  const detail = mockClassDetails[classId];
  const chapterTitles = detail?.chapters.map(({ title }) => title)
    ?? ["Getting started", "Core concepts"];
  return {
    class_id: classId,
    chapters: chapterTitles.map((title, chapterIndex) => ({
      chapter_id: `demo-chapter-${classId}-${chapterIndex + 1}`,
      title,
      sequence_order: chapterIndex,
      lessons: (detail?.chapters[chapterIndex]?.lessons.length
        ? detail.chapters[chapterIndex].lessons.map(({ title: lesson }) => lesson)
        : demoLessons[chapterIndex % demoLessons.length]
      ).map((lessonTitle, lessonIndex) => ({
        lesson_id: `demo-lesson-${classId}-${chapterIndex + 1}-${lessonIndex + 1}`,
        title: lessonTitle,
        sequence_order: lessonIndex,
        estimated_duration: 25 + lessonIndex * 5,
        activities: [
          {
            activity_id: `demo-activity-${classId}-${chapterIndex + 1}-${lessonIndex + 1}-quiz`,
            title: `${lessonTitle} quiz`,
            activity_type: "QUIZ" as const,
            sequence_order: 0,
          },
          ...(lessonIndex % 2 === 1
            ? [
                {
                  activity_id: `demo-activity-${classId}-${chapterIndex + 1}-${lessonIndex + 1}-assignment`,
                  title: `${lessonTitle} assignment`,
                  activity_type: "ASSIGNMENT" as const,
                  sequence_order: 1,
                },
              ]
            : []),
        ],
      })),
    })),
  };
}
