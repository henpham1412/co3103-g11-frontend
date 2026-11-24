# FE-12 — Administrator Interface Architecture & Scope

Approved MVP: LMS-local User Access Management (`/admin/users`), Content Report
Moderation (`/admin/content-reports`), Operational Reports (`/admin/reports` for
Enrollment, Completion, and Assessment), and read-only Audit Logs (`/admin/audit-logs`).

## Open requirement / backlog discrepancy

DOC-01 UC7.2, DOC-02 Administrator Class Management, and DOC-05 §5.2 describe Admin
Class Management. Frontend issue #14 and the approved FE-12 MVP currently defer it:
the merged backend does not expose `/admin/classes` list/management APIs. This
requirement is **unresolved/deferred, not completed**. No authoritative document
has been changed. Any future scope/API decision needs separate approval.

## Access boundary

`GET /admin/users/{verifiedCurrentUserId}` verifies active LMS-local ADMINISTRATOR
access. Central Identity session restoration remains unchanged. No browser-stored
role or JWT role grants access. Decisions are in memory, reset on session/account/
token changes, and revalidated on mount, window focus, or becoming visible. Expected
probe 403s do not show the global permission toast; 401 handling is unchanged.
An authenticated Admin API 403 or confirmed self-demotion/self-suspension revokes
privileged children and their local state immediately while keeping the Central
Identity session intact.
There is no server-push role notification: external revocation is observed on the
next request/revalidation. Backend authorization remains mandatory for every call.

## Contract constraints

- Clients use the existing `/api/v1`-based `lmsClient`, canonical snake_case fields,
  one-based pages, and runtime response validation. Invalid payloads fail closed.
- Only user role/status and report review status have PATCH clients. No create/
  delete/global account/audit mutations or class management operations are added.
- Operational reports accept only optional `class_id`; All classes is the default.
  A validated Class UUID input filters all three reports. No class-list dropdown,
  invented endpoint, date filter, or analytics dashboard is provided.
- Audit IDs are UUIDs; redacted details remain unavailable. File downloads use
  the report-scoped endpoint, never a target-supplied URL with Bearer credentials.

Automated Vitest/MSW verification covers all four screens and access boundaries;
live three-service browser/PostgreSQL E2E verification remains tracked under QA-1/QA-2.
