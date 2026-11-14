# FE-8 progress views and review fixes

PR #21 stays on `feat/fe-8-progress-views`. The original PR head was
`03cefd31c60f4ebec84bb493455c7318ee4b31ab`, with merge base
`c70127884c819a6a85e80d62ac1da939c77ba721`. The live Git remote's main was
`7a05385994d9093d3de438c80c6cf0da50d5106e`; its completed FE-2/3/4/5/6 changes
supply the canonical layouts, activity pages, clients, authentication, route gates,
styles and tests missing from the original PR. Main was merged into the existing
PR branch without rebasing or force-pushing. Conflict resolution preserves those
completed implementations and reapplies only FE-8 progress integration. No experimental
branch is required. GitHub's earlier PR metadata reported an older base SHA; actual
remote refs and the merge base were inspected before integration.

## Contracts

- Student class progress: `GET /classes/{classId}/progress`. Lessons have
  `marked_at` and `assessment_statuses`, not outline `activities` or `completed_at`.
  Assessment statuses contain `activity_id`, `title`, `activity_type`, `status`
  and nested `attempts` with canonical attempt IDs, status and scores.
- Continue learning obtains the canonical `/resume-target`. For QUIZ_ATTEMPT it
  refreshes class progress and finds that exact nested IN_PROGRESS attempt, then
  uses its real Lesson and Activity IDs. It never searches the first history page
  or invents a Quiz/Activity relationship. LESSON and CLASS_OUTLINE targets retain
  their canonical navigation behavior. A completed lesson is not Quiz completion.
- History: `/me/assessment-history?page=1&size=20` uses the backend's pagination
  envelope and exposes navigation to later pages. `IN_PROGRESS` is shown as such;
  `SUBMITTED` is labelled awaiting grade when score is null, or graded when a score
  is available. These are presentation labels, not invented backend statuses.
  Zero is a real score. No passed/auto-submitted/class-title fields are assumed.
  Feedback is retained. Empty pages, failed reads, retry and returning to the first
  page after history shrinks have distinct UI behavior.
- Tutor list/member progress uses `/tutor/classes/{classId}/progress` and
  `/tutor/classes/{classId}/members/{classMemberId}/progress`. Assessment outcomes
  are keyed by attempt ID, allowing repeated attempts for one Activity.
- Tutor progress exposes `skill_mastery: [{skill_topic_id, name, level}]`.
  Null level is presented as no assessment evidence; an actual zero-score WEAK
  assessment is still WEAK. This is not a percentage model. No dedicated LMS-9
  mastery or recommendation API has been added by FE-8.

All API URLs use the existing lmsClient `/api/v1` base, session interceptors and
error normalization. Tutor routes retain the existing TutorRoute server-backed
role gate; ProtectedRoute alone remains the authentication gate. Server ownership,
local role, membership, publication and archived-history checks remain authoritative.

## Request identity, invalidation and completion

`useProgressResource` keys results by context and retry identity and ignores aborted
responses, including transports that resolve after cancellation. Prior data becomes
unrenderable immediately on an identity change, without waiting for an effect.
Student class progress, history pages, Tutor lists and member cards reuse it.

`TutorProgressPanel` receives the Class ID and parent reload revision. A selected
member must still exist in the refreshed ACTIVE-member progress list. Reload first
invalidates the list and member card, then re-reads the selected member only when
still active. Class/member changes, removal, 403/404/other errors, and out-of-order
responses cannot display another learner's details alongside a new error. Loading,
empty and failed reads are separate states with retry for failures.

Student Lesson completion remains an explicit mark/unmark action, followed by a
canonical progress refresh. Reading a lesson only records last visit. Failed status
reads disable writes instead of fabricating incomplete state. Last-visit failures
are handled visibly, and archived lessons do not offer completion writes. The
completion control is keyed to the actual Class/Lesson pair.

## Regression coverage and commands

Contract-shaped fixtures are in `src/test/fixtures/progress.ts`. Focused tests cover:

- Nested Quiz resume, outline fallback and class-change failure isolation.
- Real-client progress/resume/mark/unmark/last-visit routes and Tutor read failures.
- Real-client history pagination, canonical statuses, zero/pending scores, feedback,
  empty/error/retry behavior and shrinking-page recovery.
- Tutor loading, null versus WEAK mastery, class/member/reload/removal invalidation,
  error handling and a deliberately late response that ignores cancellation.
- Canonical mark/unmark refresh and archived/unavailable completion behavior.

Run from the PR branch:

```sh
./node_modules/.bin/tsc -b --pretty false
npm run build
npm run lint
npm test -- src/features/classes/components/ClassProgressPanel.test.tsx src/features/classes/pages/AssessmentHistoryPage.test.tsx src/features/tutor-classes/components/TutorProgressPanel.test.tsx
npm test -- src/features/classes/components/LessonCompletionControl.test.tsx src/features/classes/api/progressApi.test.ts
npm test
git diff --check
```

The full suite includes existing auth/session, TutorRoute, roster, content, class,
lesson and Quiz tests. Vite's large-chunk advisory is not hidden or disabled.

## FE-9 boundary

Reuse the existing progress panels, contract types, client functions and request
identity hook. Keep `level` separate from the dedicated LMS-9 endpoint's
`mastery_score` and `evidence_available`; null is neither WEAK nor zero. Future
presentation precedence remains: valid unfinished canonical resume target, then
recommendation only when none exists, then class outline. FE-8 does not implement
that future recommendation UI, dedicated mastery endpoints, Assignment mastery,
FE-12, backend changes or any DOC-01 through DOC-07 changes.
