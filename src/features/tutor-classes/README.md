# Tutor classes (FE-4) and learning content (FE-5)

Tutor-facing class management: create and edit a class, read its roster, and decide join
requests. Everything here is a thin surface over the LMS API — the server stays the authority
on capacity, membership state and permissions.

FE-5 adds the curriculum authoring screen (`pages/TutorContentManagementPage.tsx`) and the
student lesson reader (`features/classes/pages/StudentLessonPage.tsx`). Both are documented
below the FE-4 sections.

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

## Content management (FE-5)

### Endpoints used

| Action | Call |
| --- | --- |
| Read the tutor outline (hidden content included) | `GET /classes/{classId}/outline` |
| Create a chapter | `POST /classes/{classId}/chapters` |
| Edit a chapter | `PATCH /chapters/{chapterId}` |
| Delete a chapter | `DELETE /chapters/{chapterId}` |
| Reorder chapters | `PUT /classes/{classId}/chapter-order` (`{"chapter_ids":[…]}`) |
| Create a lesson | `POST /chapters/{chapterId}/lessons` |
| Edit a lesson | `PATCH /lessons/{lessonId}` |
| Delete a lesson | `DELETE /lessons/{lessonId}` |
| Reorder lessons | `PUT /chapters/{chapterId}/lesson-order` (`{"lesson_ids":[…]}`) |
| Create a TEXT or URL material | `POST /lessons/{lessonId}/materials` (JSON) |
| Create a DOCUMENT or VIDEO material from a file | `POST /lessons/{lessonId}/materials` (multipart `metadata` + `file`) |
| Edit a material | `PATCH /materials/{materialId}` |
| Delete a material | `DELETE /materials/{materialId}` |

The two order endpoints take a **full permutation** of the sibling ids, so a move sends the
whole reordered list. Materials have **no order endpoint**: a move is two `PATCH`es exchanging
`sequence_order`. Because those two writes are independent, a failure re-reads the outline
instead of leaving half-swapped positions on screen.

Every content write answers with the single item, and every caller re-reads the outline
afterwards, so the API helpers return `Promise<void>` rather than a partial row the screen
would have to splice into the tree.

### Material kinds and the file contract

`LocalMaterialStorageService` inspects the **bytes**, not the extension or the declared MIME
type, and the size ceiling differs per kind:

| Kind | Accepted | Limit | How a student reaches it |
| --- | --- | --- | --- |
| `DOCUMENT` | PDF, DOCX, PPTX | 50 MB | download through `GET /materials/files/{key}` |
| `VIDEO` (uploaded) | MP4, WebM | 200 MB | download through `GET /materials/files/{key}` |
| `VIDEO` (external) | YouTube, YouTube-nocookie, Vimeo, or a direct HTTPS `.mp4`/`.webm` | — | opened in a new tab |
| `TEXT` | rich text in `content` | — | rendered inline |
| `URL` | any HTTPS address | — | opened in a new tab |

The form checks the extension and the size before calling the API, so an oversized file never
leaves the browser; the server still answers `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`,
`400 EMPTY_FILE` or `400 INVALID_MATERIAL_TYPE_FOR_UPLOAD` when the bytes disagree, and those
codes are translated in `utils/tutorErrorText.ts`.

Uploaded files are always served with `Content-Disposition: attachment` and there is no range
or streaming endpoint, so an uploaded video **cannot** be played inline. That is why the VIDEO
form offers an external link as a first-class source: it is the only way to publish a video
students can watch in the browser. `features/classes/material-source.ts` holds the shared
predicate that separates a stored key from an external address, and mirrors the server's
trusted-host and stream-extension rules.

A stored asset key may not travel through a JSON `PATCH` (it would orphan the file and skip
upload validation), and `material_type` is not patchable at all. The edit form therefore keeps
the kind fixed, sends `content` only for TEXT and `file_url` only for URL or an external VIDEO,
and tells the tutor that replacing stored bytes means deleting the row and uploading again.

### Visibility, ordering and states

- New content defaults to `PUBLISHED`, matching the server default.
- Students only ever receive published lessons inside published chapters. Publishing a child
  under a hidden parent succeeds, so the screen says so explicitly instead of implying the
  content is now visible, and each row carries a "hidden with its parent" marker.
- A visibility `PATCH` sends **only** `status`; it never resends the title or description.
- One content mutation runs at a time. While a write is in flight its switch shows a spinner
  and the other authoring controls are disabled, because every write ends in an outline
  re-read and a second write would race the rows still on screen.
- Chapter and lesson titles are capped at 150 characters, the limit `validateContentTitle`
  enforces. Material titles are `TEXT` on the server and carry no cap.
- Loading, empty (no chapters / no materials), error and permission-denied states are all
  rendered. A `403` on the outline or on any write removes the authoring controls rather than
  leaving buttons that cannot work.
- `404 CHAPTER_NOT_FOUND`, `LESSON_NOT_FOUND`, `MATERIAL_NOT_FOUND` and the membership stale
  codes mean another tab moved the state on, so the outline is reloaded.
  `409 CONTENT_HAS_DEPENDENT_LEARNING_DATA` is not stale: the server keeps the row because
  learning records reference it, and the message points at hiding it instead.
- The save note reports the last accepted write ("Last change accepted at …") or that nothing
  has been written in this session. It never claims the curriculum is "saved" on its own.

### Student lesson reading

`GET /lessons/{lessonId}` and `GET /lessons/{lessonId}/materials` supply the lesson, while the
published outline supplies the chapter context and the previous/next navigation across chapter
boundaries. A lesson missing from the outline is explained (unpublished itself, hidden chapter,
or another class) rather than rendered as a broken page. `403` and `404` get distinct copy.

Activities listed in the outline link to the FE-6 route
`/classes/{classId}/lessons/{lessonId}/activities/{activityId}`; hidden activities are filtered
out. FE-5 does not implement the quiz or assignment screens.

Learning progress is not exposed by the current LMS APIs, so the page states that opening a
lesson does not mark it complete instead of inventing a progress indicator.
