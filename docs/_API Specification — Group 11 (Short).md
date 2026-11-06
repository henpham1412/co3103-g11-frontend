# API Specification — Group 11 (Short Edition)

## 1. Common Contract

All endpoints use `/api/v1` and JSON unless a file upload requires `multipart/form-data`. There are two hosts:

- **Central Identity:** registration, authentication, recovery, and global profile.
- **LMS instance:** local access, classes, content, assessments, progress, adaptive learning, interaction, notifications, and administration.

Use lowercase plural resources and UUID IDs. JSON uses `snake_case`; timestamps use ISO 8601, preferably UTC. List responses use:

```json
{"items": [], "page": 1, "size": 20, "total_items": 0, "total_pages": 0}
```

Protected endpoints require `Authorization: Bearer <access_token>`. JWTs are signed, contain `sub` equal to the Central Identity `user_id`, and contain `exp`. The MVP has no refresh tokens, server-side sessions, or blacklist. Logout, password reset, and global status changes do not immediately revoke existing tokens.

Roles are local to each LMS: `STUDENT`, `TUTOR`, `ADMINISTRATOR`. The LMS validates the JWT and then checks local access status, membership, ownership, and resource permissions.

Use these statuses where applicable: `ACTIVE`, `SUSPENDED`, `DEACTIVATED`, `ARCHIVED`, `PUBLISHED`, `HIDDEN`, `PENDING`, `REJECTED`, `INACTIVE`, `SUBMITTED`, `GRADED`, `IN_PROGRESS`, `READ`.

Standard status codes: `200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `413`, `415`, `423`, `429`, `500`, `503`.

Errors use one shape:

```json
{"code": "RESOURCE_NOT_FOUND", "message": "Class not found", "details": []}
```

Do not expose passwords, hashes, secrets, tokens, stack traces, or internal database details. Rate-limit responses must remain generic for password recovery and may include `Retry-After`.

## 2. Central Identity APIs

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | Public | Create an `ACTIVE` central account |
| POST | `/auth/login` | Public | Validate credentials and issue JWT |
| POST | `/auth/forgot-password` | Public | Request generic password-reset response |
| POST | `/auth/reset-password` | Public + reset token | Set a new password |
| GET | `/users/me` | Bearer | Read account and profile |
| PATCH | `/users/me` | Bearer | Update allowed profile fields |

### Register

Required: `email`, `password`, `full_name`. Normalize and validate email; require a non-empty name of at most 150 characters and a compliant password. Return `201` with `user_id`, email, name, and global status. Errors: `400 BAD_REQUEST`, `409 EMAIL_ALREADY_REGISTERED`.

### Login

Request: email, password, and optionally `client_id`/`redirect_uri` for an LMS flow. Verify registered client and redirect URI when supplied. Return `200` with `access_token`, `token_type`, `expires_in`, user identity/status, and optional client ID. Errors: `400`, `401 INVALID_CREDENTIALS`, `403 ACCOUNT_NOT_ACTIVE`, `423 LOGIN_TEMPORARILY_LOCKED`.

### Logout

No server endpoint. The client clears its token and cached user data.

### Password Recovery

`forgot-password` always returns a generic success message for accepted requests. Store only a hash of a time-limited single-use token. `reset-password` accepts token and `new_password`, returning success after marking the token used. Errors: `400 PASSWORD_POLICY_VIOLATION`, `401 INVALID_OR_EXPIRED_RESET_TOKEN`; recovery infrastructure may return generic `429` or `503`.

### Profile

`GET /users/me` returns account fields and an optional profile object. `PATCH /users/me` accepts optional name, avatar URL, bio, phone, date of birth, locale, and timezone. Omitted fields remain unchanged; nullable fields may be cleared; email is not editable. Errors: `400 VALIDATION_ERROR`, `401`.

## 3. Class and Content APIs

### Classes and Membership

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/classes` | Student | Browse/search active classes |
| GET | `/classes/{classId}` | Permitted authenticated user | View class details and outline |
| GET | `/tutor/classes` | Tutor | List owned classes |
| POST | `/classes` | Tutor | Create class |
| PATCH | `/classes/{classId}` | Owning Tutor | Update metadata/settings/status |
| POST | `/classes/{classId}/thumbnail` | Owning Tutor | Upload JPEG/PNG/WebP thumbnail, max 5 MB |
| GET | `/classes/{classId}/members` | Owning Tutor | List members/pending requests |
| POST | `/classes/{classId}/membership` | Student | Join `OPEN` class |
| POST | `/classes/{classId}/join-requests` | Student | Request `APPROVAL_REQUIRED` membership |
| DELETE | `/classes/{classId}/membership-request` | Requesting Student | Change `PENDING` to `INACTIVE` |
| DELETE | `/classes/{classId}/membership` | Active Student | Leave; change `ACTIVE` to `INACTIVE` |
| POST | `/classes/{classId}/members/{classMemberId}/approve` | Owning Tutor | Approve pending member |
| POST | `/classes/{classId}/members/{classMemberId}/reject` | Owning Tutor | Reject pending member |
| DELETE | `/classes/{classId}/members/{classMemberId}` | Owning Tutor | Remove active member |

`GET /classes` supports `q`, `enrollment_policy`, `page`, `size`, and `sort`; it returns active catalog classes only. Class creation accepts title, immutable class code, description, optional prerequisite description, optional capacity, and enrollment policy. New classes are `ACTIVE`.

Joining/rejoining reuses an existing inactive/rejected membership. Pending requests do not consume capacity. Approval checks capacity. Membership endpoints never physically delete membership or learning history. Errors include `400`, `401`, `403`, `404`, `409 CLASS_ARCHIVED`, `409 CLASS_FULL`, `409 ENROLLMENT_POLICY_CHANGED`, and `409 INVALID_MEMBERSHIP_STATE`.

### Learning Content

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/classes/{classId}/outline` | Active Student or owning Tutor | View accessible curriculum |
| GET/POST | `/classes/{classId}/chapters` | Viewer/Tutor | List/create chapters |
| GET/PATCH/DELETE | `/chapters/{chapterId}` | Viewer/Tutor | Read/update/delete eligible chapter |
| PUT | `/classes/{classId}/chapter-order` | Owning Tutor | Replace chapter order |
| GET/POST | `/chapters/{chapterId}/lessons` | Viewer/Tutor | List/create lessons |
| GET/PATCH/DELETE | `/lessons/{lessonId}` | Viewer/Tutor | Read/update/delete eligible lesson |
| PUT | `/chapters/{chapterId}/lesson-order` | Owning Tutor | Replace lesson order |
| GET/POST | `/lessons/{lessonId}/materials` | Viewer/Tutor | List/create materials |
| GET/PATCH/DELETE | `/materials/{materialId}` | Viewer/Tutor | Read/update/hide/delete material |
| GET/POST | `/lessons/{lessonId}/activities` | Viewer/Tutor | List/create Activity plus configuration |
| GET/PATCH/DELETE | `/activities/{activityId}` | Viewer/Tutor | Read/update/hide/delete activity |

Content follows `Class -> Chapter -> Lesson -> Material/Activity`. New content defaults to `PUBLISHED`. A hidden parent hides descendants. Chapters/lessons require non-empty titles and non-negative order; lesson duration is 0-1440 minutes. Materials support `DOCUMENT`, `VIDEO`, `TEXT`, `URL`; documents max 50 MB and direct videos max 200 MB. URLs must use HTTPS and supported domains where required.

Activity creation must atomically create the Activity and exactly one matching Quiz or Assignment configuration. Physical deletion with dependent learning data is rejected with `409 CONTENT_HAS_DEPENDENT_LEARNING_DATA`.

### Discussions, Notifications, and Reports

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET/POST | `/classes/{classId}/discussions` | Active member/owning Tutor | List/create threads |
| GET/PATCH/DELETE | `/discussions/{discussionId}` | Authorized participant | Read/edit/delete subject to rules |
| POST | `/discussions/{discussionId}/replies` | Active member/owning Tutor | Add reply |
| GET | `/notifications` | Authenticated user | List own notifications |
| PATCH | `/notifications/{notificationId}` | Recipient | Mark read |
| POST | `/content-reports` | Authorized Student/Tutor | Report discussion/material |

Discussion roots require title and content; replies require content and preserve class/lesson context. Deletion is blocked by replies or unresolved reports. Notifications support `is_read` filtering, consistent `read_at`, and 90-day retention. Reports use `content_type`, `content_id`, reason, optional description, and begin as `PENDING`; duplicate reports return `409 DUPLICATE_CONTENT_REPORT`.

## 4. Assessment and Progress APIs

### Assessment Configuration

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET/PATCH | `/activities/{activityId}/quiz` | Tutor or eligible Student / Tutor | Read/update quiz settings |
| POST | `/activities/{activityId}/questions` | Owning Tutor | Add question |
| PATCH/DELETE | `/questions/{questionId}` | Owning Tutor | Update/delete question subject to locking |
| GET/PATCH | `/activities/{activityId}/assignment` | Tutor or eligible Student / Tutor | Read/update assignment settings |
| POST | `/assignments/{assignmentId}/attachments` | Owning Tutor | Upload reference file |
| DELETE | `/assignment-attachments/{attachmentId}` | Owning Tutor | Remove eligible attachment |

Quiz settings require positive time limit, deadline, valid opening time, attempts >= 1, supported grading method, and required score 0-100. Questions support `MCQ_SINGLE`, `MCQ_MULTIPLE`, and `TRUE_FALSE`, with raw points and answer options. Once attempted, restricted edits return `409 QUESTION_EDIT_LOCKED` or `409 QUIZ_ALREADY_ATTEMPTED_RESTRICTED_EDIT`.

Assignment settings require deadline, valid opening time, optional positive size limit, file types, and late policy. Upload endpoints return `413 FILE_TOO_LARGE` and `415 UNSUPPORTED_MEDIA_TYPE` when applicable.

### Quiz Attempts

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/quizzes/{quizId}/attempts` | Active Student member | Start or resume attempt |
| GET | `/quiz-attempts/{attemptId}` | Owner Student/Tutor where permitted | Read attempt and remaining time |
| PUT | `/quiz-attempts/{attemptId}/answers/{questionId}` | Owner Student | Save/replace answer |
| DELETE | `/quiz-attempts/{attemptId}/answers/{questionId}` | Owner Student | Clear answer |
| POST | `/quiz-attempts/{attemptId}/submit` | Owner Student | Submit and grade |
| GET | `/quiz-attempts/{attemptId}/result` | Owner Student/Tutor where permitted | Read result |
| GET | `/quizzes/{quizId}/attempts` | Owning Tutor | Monitor attempts |

Start/resume checks visibility, active membership, opening/deadline, and attempt limits. The server returns `end_at` and remaining time but never answer keys before submission. Submit grades saved answers, treats unanswered questions as zero, and returns a 0-100 score. Repeated submission must not grade twice.

### Assignment Submissions

| Method | Path | Role | Purpose |
|---|---|---|---|
| PUT | `/assignments/{assignmentId}/submission` | Active Student member | Submit/replace current file |
| GET | `/assignments/{assignmentId}/submissions/me` | Student | Read own submission/feedback |
| GET | `/assignments/{assignmentId}/submissions` | Owning Tutor | List submissions |
| GET | `/submissions/{submissionId}` | Owner/Tutor | Read submission |
| PATCH | `/submissions/{submissionId}/grade` | Owning Tutor | Set score/feedback |

Upload-start time controls deadline checks. A graded submission cannot be replaced. Scores are 0-100; grading sets status, grader, and timestamp. Errors include membership/visibility failures, `409 SUBMISSION_NOT_ALLOWED`, `409 SUBMISSION_ALREADY_GRADED`, `413`, and `415`.

### Progress

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/me/classes` | Student | List active/archived classes and pending requests |
| GET | `/classes/{classId}/progress` | Active Student | View outline and derived lesson progress |
| PUT/DELETE | `/classes/{classId}/lessons/{lessonId}/completion` | Active Student | Mark/unmark lesson complete |
| PUT | `/classes/{classId}/last-visit` | Active Student | Upsert latest visited lesson |
| GET | `/classes/{classId}/resume-target` | Active Student | Determine resume target |
| GET | `/me/assessment-history` | Student | View own assessment history |
| GET | `/tutor/classes/{classId}/progress` | Owning Tutor | View active-member summaries |
| GET | `/tutor/classes/{classId}/members/{classMemberId}/progress` | Owning Tutor | View member progress/mastery |

Progress is lesson-based. Hidden/unavailable lessons are excluded from current calculations; viewing does not mark completion. Resume priority is in-progress quiz, last eligible visit, first incomplete visible lesson, then class outline. Former members' history is retained but not included in active-member lists.

## 5. Adaptive Learning APIs

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/classes/{classId}/recommended-activities` | Active Student | Return eligible next activity or `null` |
| GET | `/tutor/classes/{classId}/members/{classMemberId}/mastery` | Owning Tutor | Read mastery summary |

Recommendations use learning signals, mastery estimates, visible content, and `SkillPrerequisite` relationships. Exact thresholds/algorithms are defined outside this API contract.

## 6. Administration APIs

All administration endpoints require local `ADMINISTRATOR`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/users`, `/admin/users/{userId}` | Search/read local access records |
| PATCH | `/admin/users/{userId}` | Change local role/status only |
| GET/PATCH | `/admin/classes`, `/admin/classes/{classId}` | Inspect/manage local classes |
| GET | `/admin/content-reports`, `/admin/content-reports/{reportId}` | List/read reports |
| PATCH | `/admin/content-reports/{reportId}` | Review report and set reviewer/time |
| GET | `/admin/reports/enrollment` | Derived enrollment report |
| GET | `/admin/reports/completion` | Derived completion report |
| GET | `/admin/reports/assessment` | Derived assessment report |
| GET | `/admin/audit-logs`, `/admin/audit-logs/{logId}` | Read audit entries |

Administration changes only the current LMS database and must not change Central Identity status. Local access/status changes and moderation/class actions are audited. Reports are derived from existing records; no report tables are required. The first administrator is provisioned through trusted setup outside the public API.

## 7. Cross-Module Rules

1. Central Identity authenticates; the LMS authorizes locally.
2. `ClassMember` is the only membership entity and is never physically deleted by normal leave/reject/remove operations.
3. Class prerequisite text is informational; adaptive prerequisites are `SkillTopic` relationships.
4. Lesson completion is explicit and lesson-based; assessment states are derived separately.
5. Parent visibility controls descendant access.
6. Question points are raw; final quiz/attempt/submission scores use 0-100.
7. Learning Content owns Activity placement and visibility; Assessment owns configuration, attempts, submissions, and grades.
8. Adaptive recommendations must respect active membership, visibility, class context, and topic prerequisites.
9. Polymorphic and cross-table constraints are validated by the application.
10. No operation may unintentionally delete required learning, assessment, report, or audit history.
