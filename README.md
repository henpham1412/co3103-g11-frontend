# CO3103 Group 11 — Frontend

The frontend of **A Self-Hosted Learning Platform with Centralized Authentication**.

This application provides the web interface for Students, Tutors, and Administrators. It communicates with the Central Identity service for centralized authentication and account-related operations, and with an LMS Instance for class management, learning activities, progress tracking, and administration.

## Technology Stack

- **React + TypeScript** — UI development and type checking
- **Vite** — Development server and production build
- **React Router** — Client-side routing
- **Ant Design** — UI component library
- **Axios** — HTTP requests
- **Day.js** — Date and time handling
- **npm** — Package management

## Prerequisites

- Node.js 22.12+ (CI uses Node.js 24)
- npm

Use a consistent Node.js version across the team when possible. Vite 8 supports
Node.js 20.19+ or 22.12+, while the test toolchain in this project requires
Node.js 22.12+.

## Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd co3103-g11-frontend
```

Replace `<repository-url>` with the GitHub URL of this repository.

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a local environment file from the example:

**PowerShell**

```powershell
Copy-Item .env.example .env.local
```

Update the API base URLs in `.env.local` to match the local backend configuration.

Each client uses the first non-empty value in the following order:

| Client | Preferred variable | Legacy alias | Default |
|---|---|---|---|
| Central Identity | `VITE_CENTRAL_IDENTITY_API_URL` | `VITE_IDENTITY_API_BASE_URL` | `http://localhost:8080/api/v1` |
| LMS | `VITE_LMS_API_URL` | `VITE_LMS_API_BASE_URL` | `http://localhost:8081/api/v1` |

The preferred variable wins when both names are set. Base URLs include `/api/v1`;
API methods append paths such as `/auth/login` without repeating that prefix.
Restart the development server after changing environment variables. For preview,
rebuild first: `VITE_*` values are embedded at build time, so restarting preview
alone does not change them.

Environment variables prefixed with `VITE_` are exposed to client-side code. Do not put passwords, signing keys, or other secrets in these variables.

Configure the login context separately from API URLs:

| Variable | Rule |
|---|---|
| `VITE_AUTH_MODE` | `lms` (default) or explicitly `standalone`. Unknown or blank modes block sign-in. |
| `VITE_LMS_CLIENT_ID` | Required in LMS mode: an active client provisioned in Central Identity, 1–100 characters without whitespace. |
| `VITE_LMS_REDIRECT_URI` | Required in LMS mode: a full HTTP(S) URL without credentials, whitespace or backslashes, matching a registered redirect URI exactly. |

For example, after provisioning a client named `g11-lms` with the redirect URI
`http://localhost:5173/`, set:

```dotenv
VITE_AUTH_MODE=lms
VITE_LMS_CLIENT_ID=g11-lms
VITE_LMS_REDIRECT_URI=http://localhost:5173/
```

The example does not provision a client or imply one already exists. The app has
no `/auth/callback` route. The URI is request context sent to Central Identity;
successful login still navigates to the validated internal `from` destination.
Query parameters and router state cannot override deployment context. JWTs are
never placed in URLs, and login does not redirect to an external origin.

For standalone login, set `VITE_AUTH_MODE=standalone` and leave both LMS variables
empty or unset. Both context fields are then omitted from the request. Setting
either LMS variable in standalone mode is a configuration error. Missing or invalid
LMS configuration shows a safe banner and disables submission; it never silently
falls back to standalone. `.env.example` intentionally leaves provisioning values
empty, so configure them before signing in.

### 4. Start the Development Server

```bash
npm run dev
```

Open the local URL printed in the terminal.

The class screens also have an explicit fixture-backed mode, switched on by the
checked-in `.env.demo`, for reviewing the layouts without a seeded backend:

```bash
npm run dev -- --mode demo
```

Only `VITE_DEMO_MODE` is set there, so sign-in and every other screen still use
the configured Central Identity and LMS APIs. Tests pin the flag off
(`vitest.config.ts`), so a local `.env.local` can never point the suite at fixtures.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run lint` | Run ESLint |
| `npm run build` | Type-check and build the production frontend |
| `npm run preview` | Preview the production build locally |
| `npm run test` | Run all Vitest tests once |
| `npm run test:watch` | Run Vitest in watch mode |

On Windows, use `npm.cmd` if PowerShell blocks the `npm.ps1` launcher.

## Authentication Foundation

`src/types/authWire.ts` defines the DOC-05 HTTP contracts; `src/types/auth.ts`
defines camelCase form, user, and session models. `src/api/authMapping.ts`
serializes requests and validates unknown responses before mapping them:

- Registration sends `{ email, password, full_name }` and reads
  `{ user_id, email, full_name, status, message? }`. No creation timestamp is
  required or generated. The UI uses a local success message.
- Login reads `{ access_token, token_type, expires_in, user, client_id? }`, with
  identity nested under `user`, then returns a flat camelCase internal model.
  LMS requests send `{ email, password, client_id, redirect_uri }`; standalone
  requests send only `{ email, password }`. The serializer rejects incomplete or
  malformed context before HTTP. LMS responses must echo the exact requested
  `client_id`; missing or mismatched values produce `502 INVALID_AUTH_RESPONSE`
  without saving a session. Standalone permits an omitted response `client_id`
  or the backend's `central-identity` value.
- `/users/me` reads `{ user_id, email, full_name, status, profile? }`. Profile may
  be omitted, null, empty, or contain the documented optional fields. Profile
  keys are mapped explicitly and kept in memory, outside persisted sessions.

Global account statuses are `ACTIVE`, `SUSPENDED`, and `DEACTIVATED`.
Legacy camelCase HTTP identity/token fields and `INACTIVE` are rejected.
Undeclared fields, including global `role`, do not enter auth models or sessions;
LMS authorization remains the responsibility of each LMS.

`authApi` provides `register`, `login`, and `getCurrentUser`, all accepting an
optional `AbortSignal`. Only API fields are sent: `confirmPassword` and
`rememberMe` stay on the client. An explicit token on `getCurrentUser` is scoped
to that request. Response data is validated before use; login and current-user
responses must represent an `ACTIVE` account. `ApiError` preserves business codes
and supports the backend's `validationErrors`, `errors`, and `lockedUntil`
extensions. DOC-05's optional `details` adapter is separate work.
Transport failures have status `0`; malformed success bodies have status `502`
and code `INVALID_AUTH_RESPONSE`.

`calculateSessionExpiry` takes the earliest JWT `exp` and `expiresIn` deadline,
with a maximum of 24 hours for remember-me sessions. A structurally valid JWT
without `exp` requires `expiresIn`; malformed claims or tokens expire immediately.
JWT decoding only determines the client deadline. Signature verification and
authorization remain backend responsibilities.

`tokenStorage.saveSession(session)` stores version `2` under
`co3103.auth.session`: `localStorage` for remember-me, `sessionStorage` otherwise.
Saving removes older records in both stores and returns `false` if validation,
cleanup, or writing fails. Only declared session fields are persisted.
`getSession()` removes corrupt/expired records and returns `null` when no valid
session exists. Reads never extend the saved absolute deadline. If both stores
contain valid records, the persistent session wins and the stale tab record is removed.
`clearSession()` attempts both stores and returns whether both removals succeeded.
Passing a session ID scopes deletion to that session so an old tab cannot delete
a newer login. Failed removals quarantine that ID in memory for the current page
lifetime. Storage exceptions are caught. Browser storage is accessible to JavaScript;
these helpers provide expiry and lifecycle handling, not protection against XSS.

Session schema version 2 adds a random, non-secret `sessionId` for scoped logout
signals. Version 1 records are discarded and require signing in again. Cross-tab
signals contain IDs and lifecycle metadata only, never tokens or profile data.
The provider reconciles browser storage on focus/visibility recovery and protects
newer sessions from delayed timers, requests and logout messages. Anonymous 401s
cannot cancel a pending login. LMS 403s notify without purging the session.

Both HTTP clients reject redirects, including on public login/registration calls,
to prevent forwarding passwords or Bearer headers beyond the configured API.
The error normalizer also accepts RFC 7807 `title`, `detail`, and `instance`, with
DOC-05 fields taking precedence and the HTTP response providing the status.

## Authentication Pages

`/login` (AUTH-01) and `/register` (AUTH-02) use the shared responsive auth
layout, Ant Design 6.6.6, and the Figma tokens in `src/app/theme.ts`. Inter
Variable and IBM Plex Mono are bundled locally. The layout supports viewports
from 320px; the cards are capped at 440px and 460px respectively.

Login uses `useAuth` for session persistence. It accepts navigation state
`{ from, email, message, messageType }`, where `from` is a local path or router
location and `messageType` is `success` or `info`. Registration replaces its
history entry with `/login`, passing the normalized email, a success message,
and the validated local return destination. The destination survives navigation
between the auth pages. External URLs, encoded separators/controls and return
paths to the auth pages fall back to `/`. Leaving the login page cancels its
pending authentication operation, preventing late responses from saving a session
or redirecting through the public-route guard. Password recovery opens
administrator guidance in a modal.

Form validators live in `src/features/auth/utils/authValidation.ts`. Identity
fields are trimmed and email is lowercased on submission. Passwords are never
trimmed or normalized: registration requires JavaScript length >= 8 and both
forms require nonblank passwords and enforce <= 72 UTF-8 bytes. Login intentionally
accepts shorter passwords. The password checklist mirrors these rules; full names
reject all Unicode control characters. Both forms map supported HTTP 400
`details: [{ field?, message }]` diagnostics into the form, with `full_name`
mapped to `fullName`, and focus the first invalid field. The frontend accepts
optional/null `field` for unbound diagnostics. DOC-05 defines the optional
`details` envelope; this item schema is the frontend integration contract, not
a guarantee that every deployed backend emits it. Legacy `validationErrors`
maps and `errors` arrays remain supported. Per control, diagnostics use the first
available source in order `details` → `validationErrors` → `errors`, deduplicated
after field mapping and translation. Malformed entries are discarded while valid
siblings remain. Known validation messages use local translations;
unknown field diagnostics and unbound errors use safe local fallback copy.
Registration conflicts bind to email. HTTP 401 login failures always use generic
credential copy, even if the body supplies account lock metadata. Only HTTP 423
shows a valid lock deadline (`locked_until`, or legacy `lockedUntil`). Context
fields such as `client_id` and `redirect_uri`, unknown fields and dotted paths
produce a safe banner and never create form controls. Raw backend messages are
not displayed by either form. HTTP status and the requested endpoint determine
behavior; body status/path cannot cause logout or infer a registration conflict.
LMS 403 and server errors preserve the current session.
API failures focus the first invalid field or the error banner, including repeated
identical failures. Error/placeholder text and keyboard focus colors meet WCAG AA
contrast thresholds. Input and checkbox borders use a darker component token;
decorative card borders retain the layout token. Password visibility controls have
a 24px target and a visible keyboard focus indicator.

## Testing

Vitest uses jsdom and the `@/` alias for `src/`. The setup in `src/test/setup.ts`
loads jest-dom matchers, cleans up React renders, and starts/resets/stops the MSW
server. Unhandled requests fail tests even when application code catches the
network failure (the setup self-test explicitly accounts for its deliberate
unmatched request). Default handlers live in `src/test/server.ts`; independent
snake_case HTTP fixtures live in `src/test/fixtures/authWire.ts`. CamelCase
fixtures in `src/test/fixtures/auth.ts` are for internal API mocks and storage. Override
handlers in individual tests with `server.use(...)`. UI setup stubs standalone
mode before each test; LMS tests override all context variables explicitly, so
local deployment settings do not affect the suite. No live backend is required.

Contract regressions cover registration without timestamps, nested login,
optional profiles, malformed/legacy responses, and registration → login →
provider remount/restore → logout in both persistence modes. These are MSW tests,
not evidence of live backend compatibility. Central Identity must implement the
DOC-05 `/users/me` response before live restoration can work; the legacy
`{ id, fullName, role, ... }` response is deliberately unsupported. The backend
DTO/profile change belongs in its own repository.

For production browser verification:

```bash
npm run build
npm run preview -- --host localhost --port 5173 --strictPort
```

Open **http://localhost:5173**. Stop any development server using that port first.
Central Identity and LMS default CORS allowlists include `http://localhost:3000`
and `http://localhost:5173`. `--strictPort` prevents an automatic move to 5174
that would change the origin and fail CORS. Hostname, scheme and port all matter;
`127.0.0.1` is a different origin from `localhost`.

With both configured services running, verify preflights (use `curl.exe` in
PowerShell):

```bash
curl -i -X OPTIONS http://localhost:8080/api/v1/auth/login -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"
curl -i -X OPTIONS http://localhost:8081/api/v1/users/me -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization"
```

Expect a successful HTTP response, `Access-Control-Allow-Origin:
http://localhost:5173`, and the requested method/header allowed. Preflights do not
need a Bearer token. A connection failure means the service is unavailable; it
does not establish a CORS failure. A custom preview origin must be allowed in
**both** services. CORS allowlists and the client's registered redirect URIs are
independent settings; update both as needed and rebuild after changing `VITE_*`.

In the browser, check registration → login → protected home → refresh → logout
in two tabs, with remember-me on and off, and in both LMS and standalone modes.
Verify invalid client/redirect responses keep the user on login without a saved
session. Use a dedicated test account and a provisioned test client; never save
passwords or tokens in verification logs. Vitest/MSW results do not prove browser
CORS or live backend compatibility.

Central Identity must enforce the complete client/redirect pair and exact URI
allowlist before issuing a JWT, and echo the validated client. The backend
baseline reviewed in PR15 (`2358fb5`) still accepts client-only requests and emits
legacy error diagnostics; those backend changes belong in its own repository.
Frontend rejection of incomplete pairs does not replace server validation.

Before handing off a change, run `npm run test`, `npm run lint`, and
`npm run build`. Tests cover API payloads, response validation, DOC-05 errors,
cancellation, URL precedence, expiry boundaries, and storage failures. A React
interaction test also verifies the Testing Library/user-event integration.

## Project Structure

```text
src/
├── app/                     # App setup, routing, providers
├── api/                     # HTTP configuration and API clients
├── components/
│   ├── common/              # Shared reusable components
│   └── layout/              # Shared application layouts
├── features/
│   ├── auth/
│   ├── account/
│   ├── dashboard/
│   ├── classes/
│   ├── learning-content/
│   ├── assessment/
│   ├── learning-progress/
│   ├── adaptive-learning/
│   ├── interaction-notifications/
│   └── administration/
├── hooks/                   # Shared React hooks
├── styles/                  # Global styles
├── utils/                   # Shared utilities
└── main.tsx                 # Application entry point
```

Feature folders and supporting files are added incrementally as implementation progresses. The structure is intended to keep related pages, components, API functions, and types organized by business responsibility.

## Backend Integration

The frontend communicates with two separate backend services:

- **Central Identity** — Centralized authentication and global account operations.
- **LMS Instance** — LMS-local classes, learning content, assessments, progress, interaction, and administration.

API base URLs are configurable through environment variables. Request and response structures should follow the agreed API specification.

Frontend route restrictions improve navigation and usability. The backend remains responsible for authentication, local LMS roles, class membership, and resource-level authorization.

## Project Documentation

The approved project documents are maintained separately from source code:

- DOC-01 — Requirements & Use Cases
- DOC-02 — UI/UX Design
- DOC-03 — System Architecture
- DOC-04 — Database Design
- DOC-05 — API Specification
- DOC-06 — Adaptive Learning Design
- DOC-07 — Development Setup

Refer to the approved documents and Figma designs before implementing new features.

## Development Notes

- Do not commit `node_modules/`, `dist/`, or your own environment files (`.env`, `.env.local`).
- Keep `package-lock.json` committed so team members can install the same dependency versions.
- Implement features incrementally and run linting and production builds before submitting a Pull Request.
- Follow the repository's branch protection and Pull Request review workflow.
