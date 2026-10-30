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

`tokenStorage.saveSession(session)` stores version `1` under
`co3103.auth.session`: `localStorage` for remember-me, `sessionStorage` otherwise.
Saving removes older records in both stores and returns `false` if validation,
cleanup, or writing fails. Only declared session fields are persisted.
`getSession()` removes corrupt/expired records and returns `null` when no valid
session exists. Reads never extend the saved absolute deadline. If both stores
contain valid records, the tab session wins and the persistent record is removed.
`clearSession()` attempts both stores and returns whether both removals succeeded.
Storage exceptions are caught. Browser storage is accessible to JavaScript;
these helpers provide expiry and lifecycle handling, not protection against XSS.

## Testing

Vitest uses jsdom and the `@/` alias for `src/`. The setup in `src/test/setup.ts`
loads jest-dom matchers, cleans up React renders, and starts/resets/stops the MSW
server. Unhandled requests fail tests. Default handlers and synthetic auth
fixtures live in `src/test/server.ts` and `src/test/fixtures/auth.ts`; override
handlers in individual tests with `server.use(...)`. No live backend is required.

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
