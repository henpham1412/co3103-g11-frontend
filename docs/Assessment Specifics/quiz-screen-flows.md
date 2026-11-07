# Quiz Screen Flows (MVP)

Two screens already exist as prototypes: **S4 Activity Overview** (attempt summary and past attempts) and **S5 In-Quiz Workspace**. Everything else is new.

**MVP scope decisions**
- No separate result screen. After submit, the student returns to S4, which updates with the new score and attempts.
- No per-question answer review. Aggregate summary only; correct answers are never shown.
- No tutor preview screen.

## Student flow

```
Class Catalog → Class Detail → Lesson list
                                   │
                                   ▼
                        [S4 Activity Overview] ◄──────────────┐
                                   │                          │
                       "Attempt Quiz" / "Resume"              │
                    POST /quizzes/{id}/attempts               │
                       (201 new │ 200 resume)                 │
                                   ▼                          │
                        [S5 In-Quiz Workspace]                │
                          │ save: PUT answers                 │
                          │ clear: DELETE answer              │
                          ▼                                   │
                   "Finish attempt…" → [S6 Confirm Submit]    │
                                   │                          │
                  POST …/submit  or  server auto-submit       │
                                   └──────────────────────────┘
                              (S4 refreshes with score + history)
```

| # | Screen | Status | Contents | Key actions / API |
|---|---|---|---|---|
| S1 | Class Catalog / Class Detail | Existing | Class list, chapters, lessons, activity links | Activity link routes by type instead of the placeholder |
| S4 | **Activity Overview** | Prototype | Title, opens/closes, attempts used/limit, time limit, grading method, passing grade, score, past attempts table | "Attempt Quiz" / "Resume" → `POST /quizzes/{id}/attempts`; history from attempts data; refreshed after submit using the submit response / `GET /quiz-attempts/{id}` |
| S5 | **In-Quiz Workspace** | Prototype | Question list or one at a time, type-based controls (single, multiple, true/false), question navigator (answered / unanswered), server-based countdown, "Finish attempt…" | `PUT` / `DELETE /quiz-attempts/{id}/answers/{qid}`; `GET /quiz-attempts/{id}` on reload |
| S6 | Confirm Submit (dialog) | New | Answered vs. unanswered count, warning that unanswered scores zero | `POST /quiz-attempts/{id}/submit` |
| S8 | Assessment History | New | Cross-class list of attempts with scores | `GET /me/assessment-history` |

**Overview states (S4)**
- **Not open yet:** button disabled, shows opening time.
- **Past deadline:** button disabled.
- **Attempts exhausted:** button disabled.
- **In-progress attempt:** button reads "Resume".
- **Just submitted:** score, pass state and past attempts table reflect the latest attempt; show an "auto-submitted" note if applicable.
- **Archived class or hidden content:** blocked, with an error page.

**Workspace behaviors (S5)**
- Warn at about 1 minute remaining.
- At expiry, show "Time's up, your attempt may be auto-submitted", then route to S4.
- Answers autosave per question, with a saved/error indicator.
- Never show correct answers.

**Errors (all student screens):** 401 → login, 403 → no access, 404 → not found, 409 → "attempt limit reached" or "quiz unavailable", 429 → retry later, 503 → try again.

## Tutor flow

```
Tutor Dashboard → Tutor Classes → Class → Content Management
                                               │
                                     Lesson → "Add activity → Quiz"
                                               ▼
                                     [T1 Create Quiz Form]
                                     POST /lessons/{id}/activities
                                               ▼
                                     [T2 Quiz Editor] ◄────────────┐
                              (questions list + settings tab)      │
                                │        │          │              │
                     Add/Edit question   Settings   Visibility     │
                                │        │          │              │
                                ▼        ▼          ▼              │
                      [T3 Question   PATCH      PATCH              │
                        Dialog]      …/quiz    …/activities/{id}   │
                      POST/PATCH/                                  │
                      DELETE question                              │
                                │                                  │
                                └──────────────────────────────────┘
                                               │
                                               └──► [T5 Attempts Monitoring]
                                                    GET /quizzes/{id}/attempts
```

| # | Screen | Status | Contents | Key actions / API |
|---|---|---|---|---|
| T0 | Content Management (lesson view) | Existing | Chapters, lessons, activities | Add "Add activity → Quiz" option; activity click opens T2 |
| T1 | **Create Quiz Form** | New | Title, description, order, visibility, time limit, attempts, grading method, opening time, deadline, required score | `POST /lessons/{id}/activities` (activity + quiz in one atomic request) |
| T2 | **Quiz Editor** | New | Tabs: Questions, Settings. Question list with type and points, edit-lock banner, visibility toggle | `PATCH /activities/{id}/quiz`, `PATCH /activities/{id}` (use `HIDDEN` until ready) |
| T3 | Question Dialog | New | Type selector (MCQ_SINGLE, MCQ_MULTIPLE, TRUE_FALSE), content, points, options with correct marks | `POST /activities/{id}/questions`, `PATCH` / `DELETE /questions/{id}` |
| T5 | Attempts Monitoring | New | Student, status, start, duration, score, pass state | `GET /quizzes/{id}/attempts` |

**Validation (T1 and T3)**
- Deadline required; opening time must precede it.
- Time limit positive; attempts ≥ 1; required score 0–100. This differs from the prototype! Maximum score is made to be always 100.
- Question content non-empty; points set.
- Multiple-choice needs at least 2 options; single and true/false need exactly 1 correct option; multiple needs at least 1 correct option.
- Publishing requires at least one valid question.

**Edit-lock handling (T2/T3)**
- If attempts exist, show a warning banner at the top of the editor.
- `409 QUESTION_EDIT_LOCKED` → "This question can't be changed because students have attempted it. Hide the quiz instead."
- `409 QUIZ_ALREADY_ATTEMPTED_RESTRICTED_EDIT` → same kind of message for restricted settings, with a hide option.
- Offer "Hide" instead of delete when attempt data exists.

## Build order

1. **Student:** S4 (adapt prototype) → S5 → S6 → S8.
2. **Tutor:** T1 → T2/T3 → T5.

## Cut from MVP
- S7 Attempt Result screen and `GET /quiz-attempts/{id}/result` deep link (S4 covers it).
- Per-question answer review.
- T4 Tutor preview.
