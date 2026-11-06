# Database Design — Group 11 (Short Edition)

## 1. Architecture Boundary

The system has one Central Identity database and one database per LMS instance.

- **Central Identity:** global users, profiles, password recovery, and registered LMS clients.
- **LMS database:** local access, roles, classes, memberships, learning content, assessments, progress, adaptive learning, discussions, notifications, reports, and audit data.
- `LmsUserAccess.user_id` is a logical reference to Central Identity `User.user_id`; it is not a cross-database foreign key.
- JWTs are stateless and signed. The MVP stores no sessions, refresh tokens, or token blacklist.

## 2. Central Identity Entities

### User

`user_id` UUID primary key; normalized unique `email`; `password_hash`; `full_name`; global `status` (`ACTIVE`, `SUSPENDED`, `DEACTIVATED`); `failed_login_attempts`; `locked_until`; `last_login_at`; `created_at`; `updated_at`.

Only `ACTIVE` users receive new JWTs. Global status is separate from local LMS access and is not changed by an LMS administrator.

### UserProfile

One-to-zero-or-one with User: `user_id` primary/foreign key; `avatar_url`; `bio`; `phone_number`; `date_of_birth`; `locale`; `timezone`; `updated_at`.

### PasswordReset

`reset_id` UUID primary key; `user_id`; `token_hash`; `expires_at`; `is_used`; `ip_requested`; `created_at`; nullable `used_at`. Tokens are single-use and time-limited.

### LmsClient

`client_id` primary key; `client_secret_hash`; `client_name`; permitted `redirect_uris`; `is_active`; `created_at`. This registers an LMS for Central Identity authentication; it does not manage local membership or roles.

### RecoveryJob and RecoveryAdmission

`RecoveryJob` supports asynchronous password recovery: `request_id`, email, client IP, state (`REQUESTED`/`DELIVERY`), optional `reset_id`, expiry/availability timestamps, lease ID, and non-negative attempt count. Completed jobs are deleted.

`RecoveryAdmission` stores accepted requests for rate control: `request_id`, SHA-256 `email_hash`, client IP, and `accepted_at`.

## 3. LMS Access and Class Entities

### LmsUserAccess

`user_id` primary key/external Central Identity ID; local display `full_name` and `email`; `lms_role` (`STUDENT`, `TUTOR`, `ADMINISTRATOR`); `access_status` (`ACTIVE`, `SUSPENDED`); `last_login_at`; `created_at`; `updated_at`.

Each LMS may assign a different local role/status to the same global user. Bootstrap creates the first active administrator through trusted setup. At least one active administrator must remain.

### Class

`class_id`; `tutor_id` -> LmsUserAccess; unique local `class_code`; `title`; `description`; optional positive `max_capacity`; `enrollment_policy` (`OPEN`, `APPROVAL_REQUIRED`); `status` (`ACTIVE`, `ARCHIVED`); `thumbnail_url`; optional `prerequisites_description`; `created_at`; `updated_at`.

Class code is immutable and unique per LMS. Prerequisite description is informational only.

### ClassMember

`class_member_id`; `class_id`; `student_id` -> LmsUserAccess; status (`PENDING`, `ACTIVE`, `REJECTED`, `INACTIVE`); `requested_at`; nullable `joined_at`; timestamps. `UNIQUE(class_id, student_id)`.

Only `ACTIVE` memberships grant access and consume capacity. Status changes retain the row and all learning history.

## 4. Learning Content Entities

### Chapter

`chapter_id`; `class_id`; `title`; optional `description`; non-negative `sequence_order`; `status` (`PUBLISHED`, `HIDDEN`); `created_at`.

### Lesson

`lesson_id`; `chapter_id`; `title`; optional `description`; `estimated_duration` from 0-1440 minutes; non-negative `sequence_order`; `status`; `created_at`.

### Activity

`activity_id`; `lesson_id`; `activity_type` (`QUIZ`, `ASSIGNMENT`); `title`; optional `description`; non-negative `sequence_order`; `status`; `created_at`; `updated_at`.

Each Activity has exactly one matching Quiz or Assignment configuration. Activity owns placement, ordering, common text, and visibility.

### Material

`material_id`; `lesson_id`; `title`; `material_type` (`DOCUMENT`, `VIDEO`, `TEXT`, `URL`); optional `file_url`; optional rich-text `content`; non-negative `sequence_order`; `status`; `created_at`.

Documents, videos, and URLs require `file_url`; text requires `content`. Material and activity ordering is coordinated within each lesson.

## 5. Assessment Entities

### Quiz

`quiz_id`; unique `activity_id`; positive `time_limit_minutes`; `attempts_allowed` (minimum 1, default 1); `grading_method` (`HIGHEST`, `AVERAGE`, `LAST`); optional `opening_time`; required `deadline`; optional `required_score` from 0-100; timestamps. Activity type must be `QUIZ`.

### Question and QuestionOption

`Question`: `question_id`; `quiz_id`; `question_type` (`MCQ_SINGLE`, `MCQ_MULTIPLE`, `TRUE_FALSE`); `content`; raw `points_awarded`; non-negative `points_deducted`; `order_index`.

`QuestionOption`: `option_id`; `question_id`; `content`; `is_correct`; `order_index`.

### QuizAttempt, AttemptAnswer, AttemptAnswerOption

`QuizAttempt`: `attempt_id`; `quiz_id`; `class_member_id`; unique `(quiz_id, class_member_id, attempt_number)`; `status` (`IN_PROGRESS`, `SUBMITTED`); `attempt_number`; `started_at`; nullable `submitted_at`; `auto_submitted`; nullable percentage `score` 0-100; nullable `graded_at`.

`AttemptAnswer`: `answer_id`; `attempt_id`; `question_id`; `is_correct`; possibly negative raw `points_earned`; unique `(attempt_id, question_id)`. Answered questions cannot be deleted.

`AttemptAnswerOption`: composite primary key `(answer_id, option_id)` linking selected options. Selected options cannot be deleted while referenced.

### Assignment and AssignmentAttachment

`Assignment`: `assignment_id`; unique `activity_id`; optional `opening_time`; required `deadline`; `allow_late` default false; optional allowed file types and positive `max_file_size_mb`; timestamps. Activity type must be `ASSIGNMENT`.

`AssignmentAttachment`: `attachment_id`; `assignment_id`; `file_name`; `storage_path`; `mime_type`; `size_bytes`.

### Submission

`submission_id`; `assignment_id`; `class_member_id`; current file metadata; `submitted_at`; `is_late`; status (`SUBMITTED`, `GRADED`); nullable percentage `score` 0-100; optional `feedback`; nullable `graded_by` -> LmsUserAccess; nullable `graded_at`; revision `version`.

`UNIQUE(assignment_id, class_member_id)`. Grading fields are required when status is `GRADED`; a graded submission cannot be replaced in the MVP. Previous file contents are not retained.

## 6. Progress and Adaptive Learning Entities

- **CompletionMark:** `mark_id`, `class_member_id`, `lesson_id`, `marked_at`; unique `(class_member_id, lesson_id)`. Unmarking deletes the row.
- **LastVisit:** `class_member_id` primary key, `lesson_id`, `visited_at`; one current visit per membership.
- **SkillTopic:** `skill_topic_id`, `class_id`, `name`, `description`, difficulty code 1/3/5 (`EASY`/`MEDIUM`/`HARD`), timestamps; `UNIQUE(class_id, name)`.
- **SkillPrerequisite:** composite key `(skill_topic_id, prerequisite_skill_topic_id)`; both topics must belong to the same class; no self-reference or cycle.
- **LearnerMastery:** `learner_mastery_id`, `class_member_id`, `skill_topic_id`, `mastery_level` (`WEAK`, `DEVELOPING`, `SUFFICIENT`), `mastery_score`, `updated_at`; unique `(class_member_id, skill_topic_id)`.
- **LearningSignal:** `learning_signal_id`, `class_member_id`, `skill_topic_id`, `signal_type` (`LESSON_COMPLETION`, `QUIZ_RESULT`, `ASSIGNMENT_RESULT`), `signal_value`, `recorded_at`, `source_type`, `source_id`.
- **LessonSkillTopic:** composite `(lesson_id, skill_topic_id)`.
- **ActivitySkillTopic:** composite `(activity_id, skill_topic_id)`.
- **QuestionSkillTopic:** composite `(question_id, skill_topic_id)`.

Associations and mastery/signals must remain within the same class context. Difficulty describes topic complexity, not learner mastery.

## 7. Administration, Interaction, and Notifications

### AuditLog

`audit_log_id`; `actor_id` -> LmsUserAccess; `action`; `entity_type`; `entity_id`; structured `details`; `created_at`. Polymorphic target fields are validated by the application. Audit data should not be cascaded away unintentionally.

### ContentReport

`report_id`; `reporter_id`; `content_type` (`DISCUSSION`, `MATERIAL`); `content_id`; `reason`; `description`; status (`PENDING`, `REVIEWED`, `RESOLVED`, `DISMISSED`); nullable `reviewed_by`; nullable `reviewed_at`; `created_at`.

`UNIQUE(reporter_id, content_type, content_id)`. A report is retained even if its target disappears.

### Discussion

`discussion_id`; `class_id`; nullable `lesson_id`; `author_id`; nullable self-reference `parent_id`; root-only `title`; `content`; `created_at`; `updated_at`.

Roots require titles; replies require a parent. Parent/reply class and lesson contexts must match. Circular references are prohibited. Deletion is blocked by replies or unresolved reports.

### Notification

`notification_id`; `recipient_id`; `notification_type`; `title`; `message`; nullable `target_url`; `is_read` default false; `created_at`; nullable `read_at`.

Unread means `is_read = false` and `read_at IS NULL`; read means both are set. Records are automatically removed after 90 days.

## 8. Relationship and Integrity Rules

- User to UserProfile is 1:0..1; User to PasswordReset is 1:N.
- One local access record exists per global user per LMS. One tutor owns many classes; one class has many members, chapters, skill topics, and discussions.
- Chapter -> Lesson -> Material/Activity is hierarchical. Activity -> Quiz/Assignment is 1:0..1.
- Quiz -> Question -> QuestionOption; Quiz -> QuizAttempt -> AttemptAnswer -> selected options.
- Assignment -> attachments/submissions; ClassMember -> attempts/submissions/progress.
- Skill topics have self-prerequisites and many-to-many mappings to lessons, activities, and questions.
- Local roles/statuses never change Central Identity data.
- Application validation is required for cross-table class consistency, polymorphic references, role checks, capacity, administrator preservation, prerequisite cycles, and separate-database references.
- Deletion rules must preserve assessment results, progress, reports, and audit records. Prefer hiding/archiving when dependent data exists.
