# Progress views feature plan

## Problem and approach

Introduce lesson-based learning progress into the existing student class journey and
tutor class-management journey without duplicating class/outline/lesson behavior. The
feature should use the documented progress APIs, keep assessment status derived from
assessment records, and make progress/resume state server-owned.

The confirmed UI shape is:

- Student progress is surfaced on the existing class detail screen and also has a
  dedicated `/classes/:classId/progress` route, with the class detail acting as the
  contextual entry point.
- Lesson completion is controlled from the existing student lesson screen.
- Assessment history remains a separate student destination, but progress views link to
  it where quiz/assignment details need more context.
- Tutor progress is added as a class-detail tab/view next to the existing syllabus and
  member roster, with the member-level detail expanded inline rather than routed.

## Screen flow

### Student

1. `/classes` loads `/me/classes`; each active membership card exposes status,
   percentage, and a Continue/View progress entry.
2. `/classes/:classId` loads the progress summary/outline for an active member. The header
   shows completed/eligible lessons, percentage, and `IN_PROGRESS`/`COMPLETED`.
   The outline shows chapter and lesson completion plus derived assessment status.
3. `/classes/:classId/progress` provides the dedicated full progress view using the
   same progress API/data model; it must not create a second conflicting source of state.
4. Continue learning calls the resume-target API. Route to an in-progress quiz
   attempt, the last eligible lesson, the first incomplete lesson, or remain on the
   outline with an explicit no-unfinished-target state.
5. `/classes/:classId/lessons/:lessonId` records last visit when the lesson is opened,
   displays its completion toggle, and refreshes the progress snapshot after mark or
   unmark. Opening alone must not mark completion.
6. Existing quiz/assignment routes remain the destination for assessments. Their
   status is read into progress; assessment history remains `/assessment-history`.

### Tutor

1. `/tutor/classes` remains the class selector.
2. `/tutor/classes/:classId` keeps existing class settings, syllabus, and active-member
   management.
3. A Progress tab/view calls `/tutor/classes/:classId/progress`, lists active members
   with summary metrics, and excludes former members.
4. Selecting a member calls
   `/tutor/classes/:classId/members/:classMemberId/progress`, expanding an inline
   detail panel that shows lesson marks, assessment outcomes, and available mastery by
   SkillTopic.
5. 403/404 states reuse the existing tutor permission/error conventions; retained
   former-member records are not exposed in the active roster.

## Use cases and behavior

- View class progress: visible/accessibly eligible Lessons are the denominator;
  hidden/unavailable Lessons are excluded.
- Mark a Lesson complete: active student membership, visible lesson, and active class
  are required; recalculate lesson/chapter/class progress.
- Undo a Lesson completion: remove only the lesson mark and recalculate; a completed
  class can return to in progress.
- Resume learning: prioritize an available in-progress Quiz attempt, then last eligible
  visit, then first incomplete visible Lesson; assignments point to their containing
  Lesson; no target returns the class outline/empty state.
- View assessment status/history: quiz and assignment statuses come from their records,
  never from lesson completion marks.
- Tutor review: show progress for active members of owned classes and drill into a
  member's outcomes/mastery.

## Existing-code introduction points

- Add progress/resume/last-visit/completion/assessment-history client functions beside
  `src/features/classes/api/classApi.ts` and `quizApi.ts`, with demo-mode adapters.
- Extend `src/features/classes/types.ts` with progress outline, status, resume-target,
  and assessment summary types; add tutor progress types under
  `src/features/tutor-classes/types.ts`.
- Evolve `ClassDetailPage` and `StudentLessonPage` rather than creating duplicate
  class/lesson screens. Preserve their current loading, membership, abort, and
  normalized-error patterns.
- Add progress presentation components/styles under `features/classes` and
  `features/tutor-classes`; share a small progress summary/outline renderer only if
  the data shape and permissions permit it.
- Add tutor API functions beside `tutorClassApi.ts`, then add the view to
  `TutorClassDetailPage`.
- Update `router.tsx` only if a dedicated tutor member-progress route or dedicated
  student progress route is selected; otherwise existing routes are sufficient.
- Update `StudentWorkspaceLayout`/`TutorWorkspaceLayout` navigation only for genuinely
  new top-level destinations; class-scoped progress should remain class-scoped.
- Add focused API, page-flow, and error-state tests using the repository's existing
  Vitest/MSW patterns.

## Notes and decisions to confirm

- Confirmed choices: expose both contextual class-detail progress and a dedicated
  student progress route; expand tutor member progress inline; wire real APIs only
  (`VITE_DEMO_MODE` does not gain progress behavior in this scope).
- The current lesson page explicitly says progress APIs are unavailable; that notice
  must be replaced only after the new API surface is wired.
- The current class types do not carry progress fields, so progress responses should
  not be inferred from catalog/outline responses.