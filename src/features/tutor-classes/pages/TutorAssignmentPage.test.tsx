import { fireEvent, render, screen } from "@testing-library/react";
import { App } from "antd";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createTutorAssignment: vi.fn(),
  getTutorAssignment: vi.fn(),
  updateTutorAssignmentActivity: vi.fn(),
  updateTutorAssignmentSettings: vi.fn(),
  uploadAssignmentAttachment: vi.fn(),
  deleteAssignmentAttachment: vi.fn(),
}));

vi.mock("../api/tutorAssignmentApi", () => api);
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    state: { status: "authenticated", user: { fullName: "Dr. Alex Morgan", role: "TUTOR" } },
    logout: vi.fn(),
  }),
}));

import TutorAssignmentPage from "./TutorAssignmentPage";

function renderCreate() {
  return render(
    <App>
      <MemoryRouter initialEntries={["/tutor/classes/c-1/content/assignment/new?lessonId=l-1"]}>
        <Routes>
          <Route
            path="/tutor/classes/:classId/content/assignment/new"
            element={<TutorAssignmentPage />}
          />
        </Routes>
      </MemoryRouter>
    </App>,
  );
}

function renderEdit() {
  return render(
    <App>
      <MemoryRouter initialEntries={["/tutor/classes/c-1/content/assignment/act-1"]}>
        <Routes>
          <Route
            path="/tutor/classes/:classId/content/assignment/:activityId"
            element={<TutorAssignmentPage />}
          />
        </Routes>
      </MemoryRouter>
    </App>,
  );
}

describe("TutorAssignmentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders creation form with settings fields", async () => {
    renderCreate();
    expect(screen.getByRole("heading", { level: 2, name: "Create Assignment" })).toBeInTheDocument();
    expect(screen.getByText("Create assignment activity")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Assignment" })).toBeInTheDocument();
  });

  it("loads and displays existing assignment settings and attachments", async () => {
    api.getTutorAssignment.mockResolvedValue({
      assignment_id: "asg-1",
      activity_id: "act-1",
      title: "Assignment: Use Cases",
      description: "Implement use cases",
      status: "PUBLISHED",
      sequence_order: 1,
      opening_time: null,
      deadline: "2099-12-31T23:59:59Z",
      allow_late: true,
      allowed_file_types: ["PDF"],
      max_file_size_mb: 20,
      attachments: [
        {
          attachment_id: "att-1",
          file_name: "reference.pdf",
          mime_type: "application/pdf",
          size_bytes: 1024,
        },
      ],
    });

    renderEdit();

    expect(await screen.findByRole("heading", { level: 2, name: "Assignment Editor" })).toBeInTheDocument();
    expect(await screen.findByText("Reference Files (1)")).toBeInTheDocument();
    expect(screen.getByText("Submissions & Grading")).toBeInTheDocument();

    // Click on attachments tab
    fireEvent.click(screen.getByText("Reference Files (1)"));
    expect(await screen.findByText("reference.pdf")).toBeInTheDocument();

    // Click on grading tab
    fireEvent.click(screen.getByText("Submissions & Grading"));
    expect(await screen.findByText("Open Grading Screen")).toBeInTheDocument();
  });
});
