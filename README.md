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
Restart the development server after changing environment variables.

Environment variables prefixed with `VITE_` are exposed to client-side code. Do not put passwords, signing keys, or other secrets in these variables.

### 4. Start the Development Server

```bash
npm run dev
```

Open the local URL printed in the terminal.

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

`src/types/auth.ts` defines the DOC-05 request/response and session contracts.
`authApi` provides `register`, `login`, and `getCurrentUser`, all accepting an
optional `AbortSignal`. Only API fields are sent: `confirmPassword` and
`rememberMe` stay on the client. An explicit token on `getCurrentUser` is scoped
to that request. Response data is validated before use; login and current-user
responses must represent an `ACTIVE` account. `ApiError` preserves DOC-05 fields,
including validation errors, business codes, and account lock deadlines.
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
paths to the auth pages fall back to `/`. Password recovery opens administrator
guidance in a modal.

Form validators live in `src/features/auth/utils/authValidation.ts`. Identity
fields are trimmed and email is lowercased on submission. Passwords are never
trimmed or normalized: registration requires JavaScript length >= 8 and both
forms require nonblank passwords and enforce <= 72 UTF-8 bytes. Login intentionally
accepts shorter passwords. The password checklist mirrors these rules; full names
reject all Unicode control characters. Both forms map HTTP 400 DOC-05
`validationErrors` and RFC 7807 `errors: [{ field, message }]` into the form and
focus the first invalid field. Known validation messages use local translations;
unknown field diagnostics and unbound errors use safe local fallback copy.
Registration conflicts bind to email. HTTP 401 login failures always use generic
credential copy, even if the body supplies account lock metadata. Only HTTP 423
shows a lock deadline. Raw backend messages are not displayed by either form.
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
unmatched request). Default handlers and synthetic auth
fixtures live in `src/test/server.ts` and `src/test/fixtures/auth.ts`; override
handlers in individual tests with `server.use(...)`. No live backend is required.

For production browser verification, build and serve the app on port 4179, then run
`node scripts/verify-auth-ui.cjs http://127.0.0.1:4179`. This optional review probe
requires Playwright with Chromium and axe-core. Set `AUTH_REVIEW_PLAYWRIGHT` to an
existing Playwright package directory and `AUTH_REVIEW_AXE` to `axe.min.js` when
using external tool installations. It mocks API responses and checks 320–1440px
layouts, WCAG A/AA rules, error focus/retries, password controls, UTF-8 boundaries,
registration/sign-in, and unsafe return destinations. The main Vitest suite does
not require these browser tools.

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

- Do not commit `node_modules/`, `dist/`, or local environment files.
- Keep `package-lock.json` committed so team members can install the same dependency versions.
- Implement features incrementally and run linting and production builds before submitting a Pull Request.
- Follow the repository's branch protection and Pull Request review workflow.
