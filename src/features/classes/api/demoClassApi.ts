import { sampleClasses } from "../data/mockClasses";
import { mockClassDetails } from "../data/mockClassDetails";
import type {
  ClassCatalogItem,
  ClassCatalogResponse,
  ClassOutlineLesson,
  ClassOutlineMaterial,
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
      description: `Demo chapter covering ${title.toLowerCase()}.`,
      sequence_order: chapterIndex,
      // The second chapter stays hidden so the published-only student view differs from the tutor view.
      status: chapterIndex === 1 ? "HIDDEN" : "PUBLISHED",
      lessons: (detail?.chapters[chapterIndex]?.lessons.length
        ? detail.chapters[chapterIndex].lessons.map(({ title: lesson }) => lesson)
        : demoLessons[chapterIndex % demoLessons.length]
      ).map((lessonTitle, lessonIndex) => ({
        lesson_id: `demo-lesson-${classId}-${chapterIndex + 1}-${lessonIndex + 1}`,
        chapter_id: `demo-chapter-${classId}-${chapterIndex + 1}`,
        title: lessonTitle,
        description: `Demo lesson about ${lessonTitle.toLowerCase()}.`,
        sequence_order: lessonIndex,
        status: "PUBLISHED",
        estimated_duration: 25 + lessonIndex * 5,
        materials: lessonIndex === 0 ? demoMaterials(classId, chapterIndex, lessonTitle) : [],
        activities: [
          {
            activity_id: `demo-activity-${classId}-${chapterIndex + 1}-${lessonIndex + 1}-quiz`,
            title: `${lessonTitle} quiz`,
            activity_type: "QUIZ" as const,
            sequence_order: 0,
            status: "PUBLISHED" as const,
          },
          ...(lessonIndex % 2 === 1
            ? [
                {
                  activity_id: `demo-activity-${classId}-${chapterIndex + 1}-${lessonIndex + 1}-assignment`,
                  title: `${lessonTitle} assignment`,
                  activity_type: "ASSIGNMENT" as const,
                  sequence_order: 1,
                  status: "PUBLISHED" as const,
                },
              ]
            : []),
        ],
      })),
    })),
  };
}

export function getDemoStudentOutline(classId: string): ClassOutlineResponse {
  return {
    class_id: classId,
    chapters: getDemoPublishedOnlyOutline(getDemoOutline(classId)).chapters,
  };
}

export function getDemoStudentLesson(lessonId: string): ClassOutlineLesson {
  for (const item of sampleClasses) {
    const lesson = getDemoStudentOutline(item.class_id).chapters
      .flatMap((chapter) => chapter.lessons)
      .find((candidate) => candidate.lesson_id === lessonId);
    if (lesson) return lesson;
  }
  throw new Error("Demo lesson not found or is hidden.");
}

export function getDemoStudentLessonMaterials(lessonId: string): ClassOutlineMaterial[] {
  return getDemoStudentLesson(lessonId).materials ?? [];
}

function demoMaterials(classId: string, chapterIndex: number, lessonTitle: string): ClassOutlineMaterial[] {
  return [
    {
      material_id: `demo-material-${classId}-${chapterIndex + 1}`,
      title: `${lessonTitle} notes`,
      material_type: "TEXT",
      file_url: null,
      content: "This is sample lesson material for the UI demo.",
      sequence_order: 0,
      status: "PUBLISHED",
    },
    {
      material_id: `demo-material-${classId}-${chapterIndex + 1}-slides`,
      title: `${lessonTitle} slides`,
      material_type: "DOCUMENT",
      file_url: null,
      content: null,
      sequence_order: 1,
      status: "HIDDEN",
    },
  ];
}

function getDemoPublishedOnlyOutline(outline: ClassOutlineResponse): ClassOutlineResponse {
  return {
    class_id: outline.class_id,
    chapters: outline.chapters
      .filter((chapter) => chapter.status === "PUBLISHED")
      .map((chapter) => ({
        ...chapter,
        lessons: chapter.lessons
          .filter((lesson) => lesson.status === "PUBLISHED")
          .map((lesson) => ({
            ...lesson,
            materials: (lesson.materials ?? []).filter((material) => material.status === "PUBLISHED"),
            activities: (lesson.activities ?? []).filter((activity) => activity.status !== "HIDDEN"),
          })),
      })),
  };
}
