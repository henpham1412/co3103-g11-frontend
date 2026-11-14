# FE-9 Phase 2: Tutor mastery

Phase 2 extends the existing Tutor Progress selected-member card on
`feat/fe-9-mastery-recommendation`. Its baseline is Phase 1 commit
`a92dac8c1a441d1d716525eea7bb55f3675d6c21`. Student recommendation, resume
precedence, Phase 1 tests and the LMS-7 contracts are unchanged.

## Verified backend contract

Source: LMS Instance `feat/lms-9-quiz-evidence` at
`17d548393f56e78deaf96dbd817f00c340a3df52`:

- `AdaptiveLearningController.tutorMastery` exposes
  `GET /api/v1/tutor/classes/{classId}/members/{classMemberId}/mastery`.
- `TutorMasteryResponse` contains class_id, class_member_id and items with
  skill_topic_id, name, mastery_score (BigDecimal/null), mastery_level (enum/null)
  and evidence_available (boolean). Both nullable fields are explicitly serialized.
- `AdaptiveLearningReadService.tutorMastery` maps persisted values within its
  read-only REPEATABLE_READ transaction. It does not recalculate them.
- `MasteryReadService.readForTutor` requires ACTIVE local TUTOR access, actual
  ownership through `requireOwningTutorRead`, and an ACTIVE member of that exact
  Class. Archived-Class reads are allowed; this frontend adds no lifecycle gate.
- The reader returns all Class topics, ordered by name then UUID, including
  topics with no evidence; an empty Class has items: []. Frontend preserves order.
- Missing/expired authentication is 401; wrong role, owner or local access is
  403; missing Class, wrong-Class member or non-ACTIVE member is 404
  CLASS_OR_MEMBER_NOT_FOUND. The existing code/message/details envelope is retained.

`Lms9AdaptivePostgresHttpTest` verifies these contracts, specifically
`tutorOwningSummaryIncludesAllClassTopicsWithExplicitNoEvidenceAndActualZero`,
`tutorSummaryPreservesPersistedPrecisionWithoutRecalculationOrDisplayRounding`,
`tutorWrongClassMemberAndMissingResourcesUse404WithoutLeakingMastery`,
`tutorCannotReadFormerOrPendingMembers`,
`tutorArchivedClassRemainsReadOnlyHistoryForOwnerAndActiveMember`, and
`progressUsesSameMasteryItemsWithoutChangingCompletionOrAssessmentHistory`.
These are inspected backend evidence, not backend tests executed in this task.

## Endpoint-scoped precision boundary

`tutorMasteryApi.getTutorMastery` reuses the authenticated lmsClient. It requests
`responseType: "text"` and replaces transformResponse for this request only, so
ordinary JSON.parse never receives successful mastery scores first. The transform
uses pinned `lossless-json@4.3.3`; numeric values are LosslessNumber instances.
Validation then copies each score's original `.value` token into an exact string
in the display model. No Number conversion, numeric formatting, truncation or
display rounding is performed. Exponent spelling and trailing zeros are retained.
Range validation uses lossless comparison against 0 and 100, without deriving a
mastery level. The UI always uses the level returned by the backend.

Scores are percentages on the backend's [0,100] scale (MasteryCalculator and V17's
mastery_score constraint), so the UI appends `%`. In particular:

- `0` / WEAK / true displays `0% · WEAK`.
- `79.99999999999999999999999999999999` / DEVELOPING / true displays that exact
  decimal token followed by `% · DEVELOPING`.
- Null score / null level / false displays “No assessment evidence,” without a
  percentage. A successful empty item list displays a distinct empty-topic state.

The discriminated display type in mastery-types.ts is separate from the wire DTO
and LMS-7's `{skill_topic_id,name,level}` model. Identity, topic fields, unique topic
IDs, score range, enum values and evidence/null consistency are checked at the
API boundary. Unsupported data becomes an error, never an empty result.

The endpoint transform retains HTTP errors even for malformed/non-JSON error
bodies, allowing existing interceptors to handle status codes. Standard error
envelopes are parsed and passed to normalizeApiError. Auth/session behavior,
global Axios defaults, Student parsing and all other clients are unchanged.

## Existing Tutor Progress integration

TutorMasterySection is mounted in the loaded MemberProgress card. Completion,
chapters/Lessons, assessment outcomes and LMS-7 skill_mastery retain their existing
rendering. No extra dashboard or route is introduced. Nothing requests mastery
until the Tutor selects a member from the current active progress list.

The existing parent Class/revision resource hides old details immediately on
reload. The selected member must still exist in the refreshed list before its
keyed MemberProgress and mastery child can mount. The mastery resource identity
contains Class, member and parent revision. `useProgressResource` is reused without
changes: identity changes/unmount cancel reads, and aborted/late responses cannot
publish data. Switching Class also requires selection within the new active list.

Mastery has independent loading, error and retry states. A temporary/network error
does not erase completion, outcomes or LMS-7 mastery. Retry only refetches mastery.
401 uses existing session-expiry interceptors. On a current mastery 403/404, the
parent clears selection, unmounts all selected-member details and refreshes the
active-member list; access rejection is not converted into empty topics. A late
403/404 from an aborted old context cannot invalidate the new selection.

## Verification

New tests use raw JSON text at the MSW boundary. Building a JS numeric fixture
would destroy precision before the request, so the fixtures deliberately avoid it.
Coverage includes exact numeric/exponent tokens, zero/null distinction, malformed
and inconsistent data, Class/member identity, auth interceptors, status/envelope
handling, endpoint cancellation and unchanged parsing on another endpoint.
Component tests exercise real clients through MSW, selected-member fetch gating,
all display states, independent retry, 401, access rejection/list refresh, Class
and member changes, parent reload/removal, late responses and unmount cancellation.
Existing regression assertions remain intact; legacy Tutor tests stub only the new
independent API, while the new component tests exercise its real implementation.

Commands:

```sh
./node_modules/.bin/tsc -b --pretty false
npm test -- src/features/tutor-classes/api/tutorMasteryApi.test.ts src/features/tutor-classes/components/TutorMasterySection.test.tsx src/features/tutor-classes/components/TutorProgressPanel.test.tsx src/features/tutor-classes/pages/TutorClassDetailPage.test.tsx
npm test -- src/features/classes/components/StudentRecommendation.test.tsx src/features/classes/components/ClassProgressPanel.test.tsx src/features/classes/api/recommendationApi.test.ts src/features/classes/progressModel.test.ts src/features/classes/pages/ClassProgressPage.test.tsx
npm run lint
npm run build
npm test
git diff --check
```

Focused Tutor API/component/regression run: 78 passed across 4 files, including
32 new API/parser tests and 15 new component tests. Phase 1 regression run:
41 passed across 5 files. TypeScript, lint and production build passed; the build
retains a nonblocking chunk-size warning. An initial Tutor run overlapped another
test process and the build: 77 passed and the existing roster test
`shows both membership states and decides pending requests through the API` hit
its 15-second timeout. The same 78-test command passed in isolation without code,
assertion or timeout changes. That test operates on roster approval, not mastery.
The final full suite passed: 1,162 tests across 72 files in 283.59 seconds.
Both working-tree and staged diff checks passed. The local backend connection
check to localhost:8081 failed (connection refused), so no live E2E result is claimed.

Live authenticated end-to-end verification requires a reachable deployed LMS-9
Phase 5 backend and suitable Tutor accounts/Class/member fixtures. Contract-shaped
frontend tests do not establish deployment availability. No backend, migration,
Assignment, DOC-01–DOC-07, global auth, Student recommendation or LMS-7 model changes
are included. No PR is created in this phase.
