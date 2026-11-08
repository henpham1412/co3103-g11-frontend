# Quiz-only Assessments Plan

## Problem

The assessment documents describe a quiz-only frontend expansion, but they contain scope and contract inconsistencies. The implementation must follow one agreed MVP surface and avoid inventing behavior where the API contract is ambiguous.

## Decisions

- Treat `docs/Assessment Specifics/quiz-screen-flows.md` as the MVP scope authority.
- Do not build a separate result screen or result deep link in the MVP. After submit, return to S4 Activity Overview and refresh its score/history.
- Do not build tutor preview in the MVP.
- Treat quiz configuration GET as available to eligible students and tutors; PATCH remains owning-tutor-only, matching `Quiz.md`.
- Handle the student error statuses explicitly listed in the screen flows: 401, 403, 404, 409, 429, and 503. The API contract's 423/500 handling remains outside this MVP decision and must not be silently represented as a successful state.
- Permit atomic creation of a hidden/draft-like quiz without questions, add questions in the editor, and require at least one valid question before publishing or attempting.
- The student S4 quiz response must include the overview fields used by the frontend: activity title/description, attempts used and summaries, current score, and any in-progress current attempt. These are an agreed extension to the short API response contract and must be implemented by the backend.

## Todos

1. Establish quiz API types and client mappings for activity overview, attempt lifecycle, answers, submit, and assessment history.
2. Replace activity placeholder routing with quiz activity overview and student attempt routes.
3. Implement S4 overview, S5 workspace, S6 confirmation, autosave/clear, server-authoritative timer, submit, and return-to-overview behavior.
4. Add tutor quiz creation/editor/question-management surfaces with validation, visibility, and edit-lock handling.
5. Add assessment history and tutor attempts monitoring after the core student flow.
6. Add focused tests for routes, API payloads, validation, timer/expiry, save/clear/submit, and documented error states.

## Notes and unresolved contract risks

- `Assessment Specifics/plan.md` is stale relative to `quiz-screen-flows.md` because it still specifies a result route and tutor preview.
- The short API spec has an unclear combined role label for quiz GET/PATCH; `Quiz.md` is the more precise source.
- The screen flows omit standard API statuses 423 and 500. The selected MVP behavior handles only the listed student statuses; this should be revisited if backend responses expose those statuses.
- Existing frontend contracts are Central Identity/profile-focused and do not yet define LMS quiz wire models or clients, so new quiz types must follow the API's snake_case JSON and generic error shape.
