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

- Node.js compatible with the project's Vite version
- npm

Use a consistent Node.js version across the team when possible. Vite 8 requires Node.js 20.19+ or 22.12+; supported newer versions also work.

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