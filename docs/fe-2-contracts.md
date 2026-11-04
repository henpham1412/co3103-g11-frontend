# FE-2 integration contracts

Source: the supplied `FE-2_SPEC_AND_PLAN_PROMPT.md` and `FE-2_DETAILED_PLAN.md`, plus the existing FE-1 implementation. The complete CI-3/DOC-05 documents and Figma frames AUTH-03/AUTH-04 are not available in this repository. The assumptions below are explicit integration defaults, not verified backend behavior.

## HTTP boundary

All paths use the existing Central Identity client (base URL already includes `/api/v1`). Recovery uses `skipAuth: true`, never sends Authorization, and does not require LMS configuration. Profile uses a captured session's request-scoped Bearer credential. Redirects remain disabled; errors retain HTTP status and use local presentation copy.

| Method/path | Request | Response handling |
| --- | --- | --- |
| POST `/auth/forgot-password` | `{ email }` (trimmed, lowercase) | Spec requires generic 200; ignore response body; identical local confirmation |
| POST `/auth/reset-password` | `{ token, new_password }` | Accept transport 2xx acknowledgment; exact success status/body unspecified; non-2xx fails |
| GET `/users/me` | No body | Existing validated identity/profile decoder; ACTIVE identity required |
| PATCH `/users/me` | Changed writable fields at top level | Accept transport 2xx acknowledgment, then GET canonical user; exact status/body unspecified |

Flat PATCH is a working assumption from the spec's writable field list. No nested `profile` request or inferred endpoint is introduced. PATCH success followed by GET failure is **saved-unverified**: reload only GET, never automatically repeat PATCH. Network/timeout mutation failures may have reached the server; explicit reload can reconcile them.

| UI field | Wire field | Write rule |
| --- | --- | --- |
| fullName | full_name | Required nonblank string, trimmed, max 150, no control characters (existing FE-1 policy); never null |
| avatarUrl | avatar_url | Absolute HTTP(S), no credentials/control characters |
| bio | bio | Plain text; preserve meaningful whitespace/newlines |
| phoneNumber | phone_number | String; preserve leading zero and plus |
| dateOfBirth | date_of_birth | Strict real calendar date YYYY-MM-DD, no later than local today at validation time |
| locale | locale | String; no invented locale whitelist |
| timezone | timezone | String; no invented timezone whitelist |

`userId/user_id`, email and status are read-only; no role or membership is inferred. Unknown keys never reach PATCH. Empty changes never send HTTP. Nullable GET fields do **not** establish nullable PATCH semantics: initial missing/null/empty values display blank, unchanged blanks are omitted, and clearing an existing optional value is blocked with guidance to supply a value or cancel. Until CI-3 confirms field-specific clearing, no null or blank optional writes are emitted. No undocumented phone/bio/URL length limits are imposed.

## Recovery policy and secrets

Spec: at least eight characters, uppercase, lowercase, digit and special character. Implementation default: JavaScript length, ASCII uppercase/lowercase/digit, Unicode punctuation or symbol for special (whitespace/control does not qualify). The 72 UTF-8 byte maximum is inherited from FE-1, pending CI confirmation. Passwords and opaque reset tokens are never trimmed/normalized. Login/registration policy remains unchanged.

URLSearchParams decodes token once. Missing/blank/duplicate token queries use manual entry; duplicates are not arbitrarily selected. Capture in component memory, replace URL without token, never copy secrets into navigation state/storage/links/logs. A new query invalidates the old operation. Refresh after scrub requires manual entry or reopening the email. `no-referrer` protects outgoing referrers; the initial URL still reaches hosting, whose access logs are outside frontend control.

Recovery routes are public during anonymous/authenticated/restoring/restore-error states. Anonymous reset success replaces the route with sign-in and local success copy. An existing authenticated session is preserved with a success panel/link to profile. Pending/error restore uses a success panel with a route to sign-in through existing session recovery. No automatic login/logout after reset.

Error diagnostics use allowlisted field aliases and local copy, never raw server messages. Field precedence is details, validationErrors, then errors. `INVALID_OR_EXPIRED_RESET_TOKEN` has dedicated safe feedback. Forgot confirmation does not prove backend uniform timing or email delivery.

## Session and presentation

Canonical profile refresh stays authenticated, uses independent cancellation/sequencing and validates session generation, ID, user ID and expiry before apply. It updates user/identity only in memory, preserves token/session ID/expiry/rememberMe/version, never rewrites persisted sessions or broadcasts profile data. Logout, expiry and account switch invalidate pending work. Profile synchronization across existing tabs is not promised.

Use Inter and existing Ant Design layout. FE-2 scoped theme uses input border `#D0D5DD` and hover `#2845A3`; FE-1 retains its intentional contrast override `#8590A2`. Profile max width is 1000px; inputs 42–44px/radius 8, cards radius 12/border `#E4E8F0`. Text/focus contrast tests do not certify normal input-border contrast; the design border is below 3:1 on white and remains an explicit design/accessibility limitation. Figma has not been directly compared; no pixel-perfect claim.

Connected Workspaces is an unavailable section, not an empty membership list or a fake API integration. A real list requires a service/endpoint/auth/schema contract. No connect/disconnect actions or global workspace role are fabricated.

## Verification boundary

Local tests use literal MSW fixtures and do not prove live CI schema, CORS, email delivery, reset TTL/reuse/revocation, production SPA rewrites or Figma fidelity. Those checks require a provisioned test environment and remain separately identified. No credentials or raw request captures belong in evidence.

## Implemented integration points

- [Recovery API](../src/api/passwordRecoveryApi.ts) and [profile API](../src/api/profileApi.ts) reuse the existing Central Identity transport, cancellation, redirect policy and error normalizer. They consume acknowledgment only; GET remains the sole canonical user decoder.
- [Reset token hook](../src/features/auth/hooks/useResetToken.ts) preserves the token across its own URL replacement and StrictMode replay; a new navigation starts a new form, and leaving/remounting the scrubbed route requires manual entry. The initial hosting request cannot be scrubbed retroactively.
- [AuthProvider](../src/features/auth/context/AuthProvider.tsx) exposes stable `refreshCurrentUser(signal)` with a separate controller/sequence and verified-session guard. Profile failures remain local, except current-session 401 or decoded inactive-account responses, which use the existing session purge lifecycle.
- [Profile orchestration](../src/features/profile/hooks/useProfile.ts) models loading/error, ready/editing, saving, saved-unverified and explicit reloading. It holds a canonical baseline, blocks duplicate mutations and never silently retries PATCH. [The editor](../src/features/profile/components/ProfileForm.tsx) keeps its draft across context rerenders and disables mutation/cancel while saving or awaiting confirmation.
- [FE-2 scoped theme](../src/app/theme.ts) retains inherited typography/motion/focus tokens. Browser checks exercised responsive recovery and profile layouts, the 1000px maximum, 44px inputs, keyboard navigation, avatar fallback, token scrub/refresh fallback, no-referrer requests, canonical save and GET-only reconciliation using synthetic accounts and mocked HTTP. These checks do not substitute for the outstanding live backend/Figma validation above.

No dependency, storage schema, backend contract, workspace endpoint, deployment or publishing change is introduced. The supplied plan/spec remain source inputs; the Issue #4 acceptance reconciliation is reserved for a future PR description, not a separate committed report.
