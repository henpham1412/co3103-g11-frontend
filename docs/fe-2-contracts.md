# FE-2 integration contracts

Sources: DOC-01 through DOC-05 and the central identity backend specification. The contract definitions cover `UpdateProfileRequest`, `UserService`, `CurrentUserController`, `UpdateProfileResponse`, `ResetPasswordRequest` and `PasswordResetController`. These establish request/response shapes, null semantics and DTO limits; they do not establish live deployment behavior. Figma frames AUTH-03/AUTH-04 have not been directly compared.

## HTTP boundary

All paths use the existing Central Identity client (base URL already includes `/api/v1`). Recovery uses `skipAuth: true`, never sends Authorization, and does not require LMS configuration. Profile uses a captured session's request-scoped Bearer credential. Redirects remain disabled; errors retain HTTP status and use local presentation copy.

| Method/path | Request | Response handling |
| --- | --- | --- |
| POST `/auth/forgot-password` | `{ email }` (trimmed, lowercase) | 200 `{ message }`; ignore body and show identical local confirmation |
| POST `/auth/reset-password` | `{ token, new_password }` | 200 `{ message }`; acknowledgment only; non-2xx fails |
| GET `/users/me` | No body | Existing validated identity/profile decoder; ACTIVE identity required |
| PATCH `/users/me` | Changed writable fields at top level | 200 `{ message, updated_at }`, then GET canonical user |

CI-3 accepts a flat PATCH body, as defined by `UpdateProfileRequest`. PATCH success followed by GET failure is **saved-unverified**: reload only GET, never automatically repeat PATCH. Network/timeout mutation failures may have reached the server; explicit reload can reconcile them. Adapters also tolerate other successful 2xx acknowledgments; compatibility tests using 204 do not change the official 200 contract.

Example PATCH response (200): `{"message":"Profile updated successfully","updated_at":"2026-11-04T12:00:00Z"}`. Example reset response (200): `{"message":"Password has been reset successfully. Please log in with your new password."}`. Neither response is decoded as a user profile.

| UI field | Wire field | Write rule |
| --- | --- | --- |
| fullName | full_name | Required nonblank string, trimmed, max 150, no control characters (existing FE-1 policy); never null |
| avatarUrl | avatar_url | Absolute HTTP(S); serialize scheme as lowercase `http://` or `https://`; reject backslashes, malformed/missing authority, credentials and whitespace/control characters; allow literal brackets in query/fragment and IPv6 hosts, reject them in paths or other authority positions; preserve path/query/fragment case and Unicode |
| bio | bio | Plain text; preserve meaningful whitespace/newlines |
| phoneNumber | phone_number | String, max 30 UTF-16 units; new values must match E.164 `^\+[1-9]\d{6,14}$`, with no whitespace; preserve the plus and digits exactly |
| dateOfBirth | date_of_birth | Strict real calendar date YYYY-MM-DD, no later than local today at validation time |
| locale | locale | String, max 20 UTF-16 units; no locale whitelist |
| timezone | timezone | String, max 64 UTF-16 units; no timezone whitelist |

`userId/user_id`, email and status are read-only; no role or membership is inferred. Unknown keys never reach PATCH. Empty changes never send HTTP. CI-3 explicitly supports null clearing for all six optional fields: `bio`, `avatar_url`, `phone_number`, `date_of_birth`, `locale`, `timezone`. Its DTO tracks supplied keys and its service applies explicit nulls. The editor converts an existing value changed to blank/whitespace into null (for example `{"bio":null}`); initially absent/null/empty fields left blank remain omitted. The serializer preserves explicit null and converts optional blank writes to null; `full_name` can never be cleared. Meaningful optional text is not trimmed.

Form and serializer share validation. Length uses JavaScript `String.length`, matching Java UTF-16 length; `maxLength` is additional UI assistance. E.164 is required and enforced by the frontend; the backend phone DTO enforces length/Unicode, but has no E.164 regex. Thus a 30-character phone passes the storage cap but fails E.164, while 31 characters triggers the length error. Untouched legacy phone values remain omitted when other fields change and can be cleared. Bio and avatar have no invented length cap.

## Recovery policy and secrets

Spec: at least eight characters, uppercase, lowercase, digit and special character. Implementation: JavaScript length, ASCII uppercase/lowercase/digit, Unicode punctuation or symbol for special (whitespace/control does not qualify). CI-3 `ResetPasswordRequest` confirms a 72 UTF-8 byte maximum and 8–128 UTF-16 units. For valid Unicode, the frontend's 72-byte maximum also keeps the value below 128 UTF-16 units. Passwords and opaque reset tokens are never trimmed/normalized. Login/registration policy remains unchanged.

Known policy differences remain explicit: the inspected CI-3 reset DTO does not enforce the frontend's complexity or NUL rejection. CI-3 birth-date validation accepts real calendar dates no later than today according to its validation clock, with no minimum date or year (including year 0000 and dates before 1900-01-01); FE retains real positive-year YYYY-MM-DD dates through browser-local today per the FE-2 specification. These year-range and clock differences remain; full accepted-value parity with the backend is not claimed.

URLSearchParams decodes token once. Missing/blank/duplicate token queries use manual entry; duplicates are not arbitrarily selected. Capture in component memory, replace URL without token, never copy secrets into navigation state/storage/links/logs. A new query invalidates the old operation. Refresh after scrub requires manual entry or reopening the email. `no-referrer` protects outgoing referrers; the initial URL still reaches hosting, whose access logs are outside frontend control.

Recovery routes are public during anonymous/authenticated/restoring/restore-error states. Anonymous reset success replaces the route with sign-in and local success copy. An existing authenticated session is preserved with a success panel/link to profile. Pending/error restore uses a success panel with a route to sign-in through existing session recovery. No automatic login/logout after reset.

Error diagnostics use allowlisted field aliases and local copy, never raw server messages. Field precedence is details, validationErrors, then errors. `INVALID_OR_EXPIRED_RESET_TOKEN` has dedicated safe feedback. Forgot confirmation does not prove backend uniform timing or email delivery.

## Session and presentation

Canonical profile refresh stays authenticated, uses independent cancellation/sequencing and validates session generation, ID, user ID and expiry before apply. It updates user/identity only in memory, preserves token/session ID/expiry/rememberMe/version, never rewrites persisted sessions or broadcasts profile data. Logout, expiry and account switch invalidate pending work. Profile synchronization across existing tabs is not promised.

Use Inter and existing Ant Design layout. FE-2 scoped theme uses input border `#667085` on white `#FFFFFF` (about 4.97:1), exceeding WCAG SC 1.4.11's 3:1 control-boundary requirement. Both recovery and profile inherit this override through their existing ConfigProviders. Hover remains `#2845A3`; focus/error tokens and decorative card styling are unchanged. FE-1 retains `#8590A2`. Profile max width is 1000px; inputs 42–44px/radius 8, cards radius 12/border `#E4E8F0`. Theme tests check normal, focus and error boundary contrast while preserving existing text/focus checks. Figma has not been directly compared; no pixel-perfect claim.

The profile uses a full-width identity card, an inline Personal Information editor, and a Security card containing only Password Recovery navigation. The header shows G11 LMS, the Central Identity / Account Profile context, and a profile badge with the current user's avatar, name and role. Clicking the badge opens a dropdown containing the **Account Profile** link to `/profile`, a divider, and the **Sign Out** action. Header role text uses Title Case (for example `Student` or `Administrator`), with `Student` as the presentation fallback. Breadcrumbs collapse on smaller screens. Sign Out also remains in the profile identity card; the header badge does not show email or account status.

Missing, null or empty optional profile values appear as blank form inputs in the inline editor. Contact/photo/preferences fields expand under Additional details. Save stays enabled for dirty invalid drafts so normal submission validation can expand the section and focus the first invalid field; invalid submissions send no PATCH. Save is disabled for pristine/reverted forms and busy/locked states.

The central API supplies neither a workspace role nor an email-verification flag. Role presentation does not grant authorization; the decoder discards undeclared global roles, so the normal header uses the `Student` fallback. The identity card's student badge and decorative, accessibility-hidden email checkmark remain presentation only. The editor labels the email as **Email Address**, without a textual Verified badge or an accessible verification claim. ACTIVE status and successful login do not establish verified email.

The mock Connected LMS Workspaces card and examples have been removed; a real list still requires a service/endpoint/auth/schema contract. No connect/disconnect actions or IP addresses are fabricated. The session display and browser/OS detection have also been removed: the Security card no longer shows Current Session, device details or Active now. Its sole action is Password Recovery, which navigates to the existing `/forgot-password` route.

## Verification boundary

Local tests use literal MSW fixtures matching the inspected CI-3 DTOs, including PATCH 200 `{ message, updated_at }`, reset 200 `{ message }` and canonical null profile values. Regression cases cover all six clears/omissions, full-name rejection, UTF-16 length boundaries, E.164, URL validation/serialization and input contrast. UI regressions also cover a collapsed invalid field revealed and focused by Save with no PATCH until correction, email labels without verification claims, the absence of session/device details and working Password Recovery navigation, header menu navigation/logout, Title Case roles and blank optional inputs. These tests do not prove live CORS, database writes, email delivery, reset TTL/reuse/revocation, production SPA rewrites or Figma fidelity. Those checks require a provisioned test environment. No credentials or raw request captures belong in evidence.

## Implemented integration points

- [Recovery API](../src/api/passwordRecoveryApi.ts) and [profile API](../src/api/profileApi.ts) reuse the existing Central Identity transport, cancellation, redirect policy and error normalizer. They consume acknowledgment only; GET remains the sole canonical user decoder.
- [Reset token hook](../src/features/auth/hooks/useResetToken.ts) preserves the token across its own URL replacement and StrictMode replay; a new navigation starts a new form, and leaving/remounting the scrubbed route requires manual entry. The initial hosting request cannot be scrubbed retroactively.
- [AuthProvider](../src/features/auth/context/AuthProvider.tsx) exposes stable `refreshCurrentUser(signal)` with a separate controller/sequence and verified-session guard. Profile failures remain local, except current-session 401 or decoded inactive-account responses, which use the existing session purge lifecycle.
- [Profile orchestration](../src/features/profile/hooks/useProfile.ts) models loading/error, ready/editing, saving, saved-unverified and explicit reloading. It holds a canonical baseline, blocks duplicate mutations and never silently retries PATCH. [The editor](../src/features/profile/components/ProfileForm.tsx) keeps its draft across context rerenders and disables mutation/cancel while saving or awaiting confirmation.
- [FE-2 scoped theme](../src/app/theme.ts) retains inherited typography/motion/focus tokens. Browser checks exercised responsive recovery and profile layouts, the 1000px maximum, 44px inputs, keyboard navigation, avatar fallback, token scrub/refresh fallback, no-referrer requests, canonical save and GET-only reconciliation using synthetic accounts and mocked HTTP. These checks do not substitute for the outstanding live backend/Figma validation above.

No dependency, storage schema, backend source, workspace endpoint, deployment or publishing change is introduced.
