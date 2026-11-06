# Tutor classes (FE-4)

Tutor-facing class management: create and edit a class, read its roster, and decide join
requests. Everything here is a thin surface over the LMS API — the server stays the authority
on capacity, membership state and permissions.

## Endpoints used

| Action | Call |
| --- | --- |
| List my classes | `GET /tutor/classes?page&size&sort` |
| Create a class | `POST /classes` |
| Edit class settings | `PATCH /classes/{classId}` |
| Replace the class thumbnail | `POST /classes/{classId}/thumbnail` (multipart `file`) |
| Read the roster | `GET /classes/{classId}/members?status&q&page&size&sort` |
| Approve a join request | `POST /classes/{classId}/members/{memberId}/approve` |
| Reject a join request | `POST /classes/{classId}/members/{memberId}/reject` |
| Remove an active member | `DELETE /classes/{classId}/members/{memberId}` |

`GET /classes/{classId}` (FE-1 class detail) supplies the seat count, policy and lifecycle
status that these screens display, so the numbers shown next to roster actions are server-side
values, not local arithmetic.

## Member management semantics

- **Approve** moves a `PENDING` membership to `ACTIVE` and consumes a seat. It is the only
  action that can fail with `CLASS_FULL`, so the button is disabled (with the reason in a
  tooltip) whenever the server-reported seats available is zero.
- **Reject** deletes the join request. The student account and any other class membership are
  untouched; the student may request again later.
- **Remove** deletes an `ACTIVE` membership and releases its seat. The confirmation dialog
  states what the backend guarantees: completion history, submissions and grades are retained,
  and the student account is not deleted.
- A request that has already been handled by another tab or tutor returns
  `INVALID_MEMBERSHIP_STATE`, `CLASS_OR_MEMBERSHIP_NOT_FOUND`, `CLASS_ARCHIVED` or
  `ENROLLMENT_POLICY_CHANGED`. All of these mean the page is stale, so the roster is reloaded
  rather than left showing buttons that can no longer work.

## Permissions

The browser holds no role claim, so access is decided by the server on each request:

- A `403` from `GET /tutor/classes` or `GET /classes/{classId}/members` renders an explicit
  "not available to your account" state and removes create/edit/approve/reject/remove controls.
- A `403` on any write is reported through the same message surface; no action is retried.

The roster API returns membership identifiers only, so students appear as
`Student · <id prefix>`. Showing names or emails requires a backend change to
`ClassMemberResponse` and is deliberately not invented here.

## Validation and feedback

Class forms validate the limits the server enforces (title, description and prerequisites
lengths, capacity, HTTPS-only thumbnail type) before sending anything, and every mutation ends
in either a success toast plus a server re-read, or a message that names what to do next. The
mapping from server error codes to those messages lives in `utils/tutorErrorText.ts`.

The thumbnail is uploaded separately from the JSON settings `PATCH`, because the backend mints
the stored file key and rejects a local file URL arriving through the JSON payload.
