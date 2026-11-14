# FE-9 Phase 1: Student recommended activity

Baseline: frontend main `2bcc4cbf683d934ff3ebaf64cbcc9f7074d21877`, the merged
FE-8 PR #21. Work is on `feat/fe-9-mastery-recommendation`, which is retained for
the later Tutor phase. Phase 1 changes Student recommendation only.

The verified backend source is LMS Instance `feat/lms-9-quiz-evidence`, commit
`17d548393f56e78deaf96dbd817f00c340a3df52`: AdaptiveLearningController,
RecommendedActivitiesResponse, AdaptiveLearningReadService and
docs/lms9-api-integration.md. Source availability does not establish deployment.
Backend main still lacks Phase 5; local localhost:8081 was not reachable during
this task. Verification here is contract-shaped frontend testing, not authenticated
end-to-end validation against a deployed Phase 5 backend.

## API and data

`getRecommendedActivities(classId, signal)` uses the existing authenticated
`lmsClient` to GET `/classes/{classId}/recommended-activities` relative to its
existing `/api/v1` base. It takes no learner selector and performs no mutation.
Existing auth interceptors and error normalization are reused unchanged.

The typed response contains class_id and either:

- A recommendation with activity_id, activity_type QUIZ, title, reason
  ADDITIONAL_PRACTICE or NORMAL_SEQUENCE, and skill_topics containing
  skill_topic_id, name and nullable mastery_level.
- A null recommendation with NO_ELIGIBLE_ACTIVITY or CLASS_ARCHIVED.

There is no Student mastery_score/evidence_available, lesson_id, quiz_id or URL.
Mastery levels come directly from the backend. Null is displayed as “No assessment
evidence,” never WEAK, UNKNOWN or a numeric score. The small shared level union is
in src/types/mastery.ts; the existing LMS-7 Tutor model is unchanged.

The API boundary validates class identity, supported Quiz/reason fields, and topic
levels. Malformed, foreign-class or unsupported responses are errors rather than
fabricated empty recommendations. HTTP failures propagate through the existing
error flow. Global JSON parsing and package dependencies are unchanged.

## Existing Progress integration and precedence

ClassProgressPanel remains the shared integration point for the class-detail
Progress tab and ClassProgressPage. Progress counts, Lesson links, assessment status
tags and the normal outline action remain present. No new route, progress store,
authentication mechanism or dashboard is introduced.

The panel's existing resource loader reads class progress, then the canonical
resume-target endpoint. Only a successful CLASS_OUTLINE response permits mounting
RecommendedActivityCard. An unfinished QUIZ_ATTEMPT or LESSON keeps the original
Continue learning flow and does not request a competing recommendation.

A failed progress/resume read shows a retriable error and does not request or show
a recommendation. A failed resume read is never converted to CLASS_OUTLINE.
Recommendation errors remain distinct from successful null/no-candidate responses.
Retry/refresh re-enters the progress/resume gate before fetching recommendations.

Recommendation presentation handles loading, additional practice, normal sequence,
empty topic associations, no evidence, no eligible activity, archived Class,
API error/retry and unresolvable targets. An error does not erase the loaded
progress summary. The existing class-outline action remains available.

## Safe navigation and request lifetime

`recommendedActivityPath` matches the exact Quiz activity_id in canonical
lesson.assessment_statuses. It does not require an attempt, infer a Lesson from
title/order, search paginated history, or turn an Assignment into a Quiz.

Opening a shown recommendation first re-fetches the canonical resume target:

1. LESSON: use existing resumePath navigation.
2. QUIZ_ATTEMPT: refresh progress and use the existing nested-attempt resumePath.
3. CLASS_OUTLINE: refresh progress and resolve the exact recommended Quiz Activity
   to its real Lesson, then navigate to the existing Activity route.
4. Failed recheck: show an error, suppress the competing recommendation and do not
   navigate. A retry obtains fresh canonical data.

An unresolved Activity cannot produce a guessed route and offers refresh instead.
Recommendation is advisory; the existing destination/source operations recheck
current access, availability and attempt limits. There is no reservation guarantee.
The integration issues GET requests only: no startOrResumeQuiz, submission,
grading, completion or LastVisit write is added to recommendation display/actions.
Existing destination-page behavior remains owned by its original module.

The existing useProgressResource hook is reused unchanged. Class changes, refresh,
and unmount cancel reads. Action errors/busy state are scoped to the loaded progress
snapshot, and pending navigation is aborted on Class change/unmount or refresh.
Old Class responses or delayed actions cannot replace current data or navigation.

## Verification

New tests use canonical DTO-shaped fixtures with completed Lessons, an unattempted
Quiz and an outline resume target: Lesson completion does not imply Quiz completion.
Coverage includes the actual lmsClient/interceptor route and Bearer handling,
cancellation, nullable/empty/malformed/error responses, all level/reason labels,
resume/read failure blocking, click-time rechecks, exact empty-attempt navigation,
disappearing targets, Class changes, late responses and GET-only behavior.
Existing FE-8 assertions remain intact. ClassProgressPage has a route-host test.

Commands run on the feature branch:

```sh
./node_modules/.bin/tsc -b --pretty false
npm run lint
npm run build
npm test -- src/features/classes/components/StudentRecommendation.test.tsx src/features/classes/components/ClassProgressPanel.test.tsx src/features/classes/api/recommendationApi.test.ts src/features/classes/progressModel.test.ts src/features/classes/pages/ClassProgressPage.test.tsx
npm test -- src/features/classes/api/progressApi.test.ts src/features/classes/pages/AssessmentHistoryPage.test.tsx src/features/classes/pages/StudentLessonPage.test.tsx src/features/tutor-classes/components/TutorProgressPanel.test.tsx src/features/tutor-classes/pages/TutorClassDetailPage.test.tsx src/features/tutor-classes/TutorRoute.test.tsx src/app/tutorRoutes.test.tsx
npm test
git diff --check
```

Results: TypeScript, lint, production build and diff checks passed. Focused tests:
41 passed across 5 files. FE-8 regressions: 62 passed across 7 files. Full suite:
1,115 passed across 70 files (280.10 seconds). The production build reports a
nonblocking warning for chunks larger than 500 kB. No dependency changes were made.

No Tutor mastery client/UI, lossless-json dependency, Assignment mastery,
backend changes, DOC-01–DOC-07 changes, FE-12 work or public API changes are included.
Live integration needs a reachable Phase 5 deployment and authenticated test data.
Tutor integration is reserved for Phase 2 on this same feature branch.
