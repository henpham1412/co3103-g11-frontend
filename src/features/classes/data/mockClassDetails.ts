export interface MockLesson {
  title: string;
  durationMinutes: number;
  completed: boolean;
}

export interface MockChapter {
  title: string;
  completedLessons: number;
  totalLessons: number;
  lessons: MockLesson[];
}

export interface MockClassDetail {
  schedule: string;
  term: string;
  estimatedLearningTime: string;
  completedLessons: number;
  totalLessons: number;
  activeLesson: string;
  tutorInitials: string;
  tutorRole: string;
  tutorBio: string;
  chapters: MockChapter[];
  learningOutcomes: string[];
  enrollmentApprovedAt: string;
}

// Display-only details taken from the supplied Student Class Detail mockup.
// They are not returned by the current class catalog API.
export const mockClassDetails: Record<string, MockClassDetail> = {
  "class-001": {
    schedule: "Mon & Fri · 10:00–11:30 AM",
    term: "Oct 5–30, 2026 · UTC+07:00",
    estimatedLearningTime: "4 hrs 35 mins",
    completedLessons: 9,
    totalLessons: 12,
    activeLesson: "Functions and parameters",
    tutorInitials: "SC",
    tutorRole: "Lead tutor",
    tutorBio:
      "Computer science educator with 8 years of experience helping beginners turn ideas into working programs.",
    chapters: [
      {
        title: "Getting started",
        completedLessons: 3,
        totalLessons: 3,
        lessons: [],
      },
      {
        title: "Variables & data types",
        completedLessons: 3,
        totalLessons: 3,
        lessons: [],
      },
      {
        title: "Control flow",
        completedLessons: 3,
        totalLessons: 3,
        lessons: [
          { title: "Conditions and decisions", durationMinutes: 25, completed: true },
          { title: "Loops and iteration", durationMinutes: 30, completed: true },
          { title: "Practicing control flow", durationMinutes: 25, completed: true },
        ],
      },
      {
        title: "Functions",
        completedLessons: 0,
        totalLessons: 3,
        lessons: [],
      },
    ],
    learningOutcomes: [
      "Write and run Python programs",
      "Work with variables and data types",
      "Use conditions, loops and functions",
    ],
    enrollmentApprovedAt: "Oct 5, 2026",
  },
};
