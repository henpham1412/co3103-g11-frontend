# Requirements & Use Cases — Group 11 (Short Edition)

## 1. Scope and Roles

The system is a self-hosted web LMS for private tutoring classes and small institutions. Each LMS instance manages its own classes, content, assessments, progress, discussions, notifications, and administration. Central Identity provides one account for access to authorized LMS instances.

Roles are LMS-local:

- **Student:** join classes, study content, complete lessons, take quizzes, submit assignments, view progress/results, discuss, receive notifications, and report content.
- **Tutor:** create classes, manage members and content, create assessments, grade assignments, and monitor progress.
- **Administrator:** manage local users/classes, review reports, view basic reports, and inspect audit logs.

Central Identity owns global identity and account status. It does not assign LMS roles or manage LMS membership.

### Initial Administrator Bootstrap

A trusted deployment/setup procedure selects an existing Central Identity user by stable `user_id` and creates or activates an LMS-local `LmsUserAccess` record with `lms_role = ADMINISTRATOR` and `access_status = ACTIVE`. Bootstrap is allowed only before the first administrator exists, must be atomic, must not use shared default credentials, and must not be exposed as an unrestricted public endpoint. At least one active local administrator must remain afterward.

## 2. User Stories

- **US1 Authentication:** Register, log in, log out, recover a password, and manage a central profile.
- **US2 Classes:** Tutors create/manage private classes; students browse, search, filter, paginate, and view class details.
- **US3 Content:** Tutors organize chapters, lessons, materials, and activities, and publish or hide them.
- **US4 Assessment:** Tutors create quizzes and file assignments; students submit work and view grades/feedback.
- **US5 Enrollment and Progress:** Students join/leave classes, track lesson completion, resume learning, and view class progress.
- **US6 Interaction:** Authorized participants discuss learning, receive notifications, and report inappropriate content.
- **US7 Administration:** Administrators manage local access/classes, moderate reports, view reports, and review audit logs.

## 3. Functional Requirements and Use-Case Summary

### 3.1 Authentication and Profile

Central Identity must support:

1. **Registration:** Validate email, name, password, and confirmation; create an `ACTIVE` account with a secure password hash.
2. **Login:** Validate credentials and global status, apply failed-login lockout, and issue a signed JWT containing `sub` and `exp`. No refresh token is used in the MVP.
3. **Logout:** Clear client-side token and cached data. The server does not revoke JWTs in the MVP.
4. **Password recovery:** Accept requests without revealing account existence; create a single-use, time-limited reset token, deliver a link, and mark the token used after reset.
5. **Profile management:** Read/update name and optional profile fields. Email is not changed by the profile endpoint.

Only global `ACTIVE` accounts receive new tokens. Each LMS validates token signature/expiry and independently checks local access, role, membership, and resource permissions. Previously issued tokens may remain valid until expiry after logout, reset, or global status changes.

### 3.2 Classes and Membership

Tutors can create and edit classes with a unique immutable code, title, description, optional capacity, optional informational prerequisite description, enrollment policy (`OPEN` or `APPROVAL_REQUIRED`), thumbnail, and lifecycle status (`ACTIVE` or `ARCHIVED`). Class codes are 3-30 characters using letters, numbers, hyphens, or underscores; titles are required and at most 150 characters; descriptions are at most 2,000 characters.

Students can browse active classes, search by title/code/tutor, filter, paginate, view the tutor and curriculum outline, and join or request access. Class prerequisite descriptions are informational and never block joining.

`ClassMember` is the only membership record. A student has at most one record per class:

| Current state | Action | New state |
|---|---|---|
| None | Join open class | `ACTIVE` |
| None | Request approval-required class | `PENDING` |
| `PENDING` | Tutor approves | `ACTIVE` |
| `PENDING` | Tutor rejects | `REJECTED` |
| `PENDING` | Student withdraws | `INACTIVE` |
| `ACTIVE` | Student leaves or tutor removes | `INACTIVE` |
| `INACTIVE`/`REJECTED` | Rejoin/request | Reuse record and set policy-appropriate state |

`ACTIVE` members alone access protected content and consume capacity. Approval checks capacity atomically; pending requests do not consume seats. Membership records and learning history are retained.

Classes are archived rather than normally deleted. Archived classes accept no new members, activities, attempts, submissions, or completion changes; retained members may have read-only access to history.

### 3.3 Learning Content

The hierarchy is:

`Class -> Chapter -> Lesson -> Material / Activity`

- Chapters and lessons have title, description, order, visibility (`PUBLISHED`/`HIDDEN`), and timestamps.
- Lessons have an estimated duration from 0 to 1,440 minutes.
- Materials support `DOCUMENT`, `VIDEO`, `TEXT`, and `URL`.
- Activities support `QUIZ` and `ASSIGNMENT` and store placement, title, description, order, visibility, and timestamps.
- New content is published by default.
- Hidden parents make all descendants inaccessible, regardless of child status.
- External URLs must use HTTPS and approved media domains where applicable.
- Documents are limited to 50 MB; direct videos are limited to 200 MB and must use approved media types.
- Physical deletion of content with completion, attempt, submission, grade, report, or other dependent data is rejected; the tutor must hide it instead.

### 3.4 Assessment

#### Quizzes

A quiz is a one-to-one configuration of a `QUIZ` Activity. It has a positive time limit, attempt limit (default 1), grading method (`HIGHEST`, `AVERAGE`, or `LAST`), optional opening time, required deadline, and optional required score from 0-100.

Questions support `MCQ_SINGLE`, `MCQ_MULTIPLE`, and `TRUE_FALSE`, with content, raw awarded/deducted points, ordered options, and answer keys. A quiz must have at least one valid question; multiple-choice questions require at least two options and valid correct answers.

A student can start/resume an attempt only when the activity is visible, membership is active, the opening time has passed, the deadline has not passed, and attempts remain. An in-progress attempt counts as used. The server determines the end time as the earlier of start plus time limit and quiz deadline, and auto-submits when it expires.

Answers are saved during the attempt. Submission grades against the current answer key. Unanswered questions score zero. The percentage score is:

`max(0, round(100 * points_earned / total_points_awarded, 2))`

Question points are raw points; attempt and required scores use 0-100. Submitted attempts can be regraded when permitted changes affect grading. After a quiz has been attempted, deleting questions, removing existing options, or changing question type is prohibited.

#### Assignments

An assignment is a one-to-one configuration of an `ASSIGNMENT` Activity. It has an optional opening time, required deadline, `allow_late` (default false), allowed file types, and optional positive file-size limit. Tutors may attach reference files.

Each class member has one current `Submission` per assignment. Students may submit or replace a file while the assignment is visible, the membership is active, the submission is not graded, and the deadline/late policy permits it. Upload-start time controls deadline checks. Replacement overwrites the current file; old files are not retained. A submission is `SUBMITTED` or `GRADED`, with optional score 0-100, feedback, grader, and grading timestamp.

### 3.5 Enrollment and Progress

Students may mark or unmark lessons complete. Completion is stored in `CompletionMark`; only visible, accessible lessons count toward progress. Quiz and assignment status comes from assessment records and does not create lesson completion marks.

Progress is derived as completed eligible lessons divided by eligible lessons. A class is `COMPLETED` only when at least one eligible lesson exists and all are complete; otherwise it is `IN_PROGRESS`. `LastVisit` stores the most recently visited lesson per class membership.

Resume priority is:

1. Available in-progress quiz attempt.
2. Most recently visited eligible lesson.
3. First incomplete visible lesson in content order.
4. Class outline/no unfinished target when none remains.

Rejoining a class restores retained progress and assessment history. Tutors can view progress for active members; former members' data remains stored but is not listed as active.

### 3.6 Adaptive Learning

Each class defines `SkillTopic` records with difficulty `EASY`, `MEDIUM`, or `HARD`, prerequisite relationships, learner mastery, and learning signals. Signals come from lesson completion, quiz results, and assignment results. Lessons, activities, and questions can be associated with topics.

The system updates mastery estimates and recommends an eligible next activity using visibility, mastery, and topic prerequisites. Exact thresholds and the fixed rule-based evaluation baseline are defined separately in the adaptive-learning design.

### 3.7 Interaction, Notifications, and Reporting

Active students and the owning tutor may create class/lesson discussions and replies. Root posts require a title; all posts require content. Replies stay in the same class and lesson context as their parent. Circular references are prohibited.

Notifications are local, recipient-specific, and generated for enrollment decisions, published content, assessment results, assignment submissions, discussion activity, and deadline reminders. Read state must agree with `read_at`; records are retained for at most 90 days.

Authenticated authorized users may report discussion or material content. Duplicate reports by the same user for the same target are rejected. Administrators review reports using `PENDING`, `REVIEWED`, `RESOLVED`, or `DISMISSED` states. Administrative actions are recorded in `AuditLog`. Enrollment, completion, and assessment reports are derived from existing data rather than stored as separate report entities.

## 4. MVP Acceptance Criteria

The MVP is acceptable when it provides centralized authentication, local role-based access, self-hosted LMS operation, class/membership management, content and assessment workflows, retained progress/history, adaptive signals and recommendations, discussions, notifications, moderation, administration, and basic reports. It must preserve the Central Identity/LMS boundary, membership history, assessment integrity, hierarchical visibility, and JWT limitations described above.

## 5. Out of Scope

Automated multi-instance provisioning, high availability, payments, tutor marketplace features, native mobile apps, live video conferencing, and advanced DRM/screen-recording prevention are excluded.
