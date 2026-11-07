# LMS Quiz Expansion Plan

## Problem
The frontend currently routes both student and tutor activity links to a placeholder activity page. The docs define a complete quiz lifecycle: tutor creation/configuration/editing, student attempt/resume/answer/submit/result, and tutor monitoring. The implementation must expand the flow without inventing endpoints or exposing answer keys before submission.

## Proposed flow

### Tutor
1. Tutor dashboard → Tutor Classes → select owned class → Content Management.
2. In a lesson, select **Add activity → Quiz**.
3. Create the activity and quiz configuration in one `POST /lessons/{lessonId}/activities` request. Collect activity placement fields plus quiz settings: time limit, attempts, grading method, opening time, deadline, and required score.
4. Build the quiz editor using the question APIs: add questions with `POST /activities/{activityId}/questions`; edit/delete with `PATCH/DELETE /questions/{questionId}`.
5. Support MCQ_SINGLE, MCQ_MULTIPLE, and TRUE_FALSE. Enforce client-side validation matching the contract: non-empty content, points, at least one correct option, at least two options for multiple-choice, exactly one correct option for single/true-false.
6. Use `PATCH /activities/{activityId}/quiz` for quiz settings and `PATCH /activities/{activityId}` for shared title, description, order, and visibility. Hide rather than delete when dependent learning data exists.
7. Add a preview/read-only mode and an attempts/monitoring view using `GET /quizzes/{quizId}/attempts`, without exposing answer keys to student-facing views.
8. When prior attempts exist, surface edit-lock warnings and map `409 QUESTION_EDIT_LOCKED` / `409 QUIZ_ALREADY_ATTEMPTED_RESTRICTED_EDIT` to actionable UI.

### Student
1. Student Class Catalog → class detail → lesson, or class detail activity link → activity overview.
2. Activity overview shows title, description, question count, time limit, attempts remaining, opening/deadline, required score, and current eligibility. It must not show correct answers.
3. Start/resume with `POST /quizzes/{quizId}/attempts`. Handle 201 for a new attempt and 200 for an existing in-progress attempt. Handle unavailable, membership, and attempt-limit conflicts.
4. In-quiz workspace shows one question at a time or a question navigator, answer controls based on question type, saved/unanswered state, server-provided remaining time, and submit action. Use `PUT /quiz-attempts/{attemptId}/answers/{questionId}` to save and `DELETE` to clear.
5. Treat the server `end_at` as authoritative. Warn before expiry; refresh/reload using `GET /quiz-attempts/{attemptId}`. On expiry, show that the server may auto-submit.
6. Submit with `POST /quiz-attempts/{attemptId}/submit`, then show an attempt summary using the returned score, required score, pass state, submission time, and auto-submission state. Provide a result route backed by `GET /quiz-attempts/{attemptId}/result` for refresh/deep links.
7. Student assessment history uses `GET /me/assessment-history`; class progress/resume can use the progress endpoints, including in-progress quiz priority.

## Contents and API constraints
- Keep hierarchy `Class → Chapter → Lesson → Activity`; use existing activity links and replace only the placeholder destination.
- Activity creation is atomic with exactly one matching Quiz configuration; do not create orphan activities.
- Quiz publishing/attempting requires at least one valid question. New content defaults to published, but the UI should allow hidden/draft-like authoring by calling `PATCH /activities/{activityId}` with `HIDDEN` until ready.
- The deadline is required; opening time, if present, must precede it. Time limit is positive; attempts are at least 1; required score is 0–100.
- Scores are percentages 0–100; question points are raw points. Unanswered questions score zero; server grading is authoritative.
- Never send or render answer keys in student attempt payloads. Correctness and per-question answer review should only be shown if the result endpoint contract permits it; otherwise show aggregate summary only.
- Do not physically delete questions/options or change question type after attempts if the API rejects it; preserve history and use hide/retire UI where supported.
- Archived classes cannot accept attempts or completion changes. Hidden parent content is inaccessible even if the activity itself is published.
- Use generic API error shape and map 401/403/404/409/429/503 without exposing internal details.

## Components/routes likely needed
- Replace `ClassActivityPlaceholderPage` with activity type routing and quiz overview/attempt/result pages.
- Add quiz API client and typed wire/domain models under `src/features/classes/api` and `src/features/classes`.
- Extend tutor content management with quiz creation/editing and activity settings/question editor.
- Add tutor attempts/monitoring surface from the existing content management route or a nested tutor route.
- Add tests for route access, API payloads, validation, timer/expiry, save/clear/submit, result summary, tutor locking, and error states.

## Notes
- The two supplied prototypes establish the student interaction targets: an in-quiz workspace and a quiz-attempt summary. Treat them as visual references, while the API contract remains authoritative for data and behavior.
- `Screen Flow.md` is empty, so the flow above is derived from the API, database, requirements, Quiz.md, and existing frontend routes.
