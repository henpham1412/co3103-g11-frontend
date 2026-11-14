import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/apiError";

const tutorApi = vi.hoisted(() => ({ getTutorClasses: vi.fn() }));
vi.mock("./api/tutorClassApi", () => tutorApi);

import TutorRoute from "./TutorRoute";

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/tutor/classes"]}>
      <Routes>
        <Route element={<TutorRoute />}>
          <Route path="/tutor/classes" element={<h1>Tutor classes</h1>} />
        </Route>
        <Route path="/classes" element={<h1>Student catalog</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  tutorApi.getTutorClasses.mockReset();
});

describe("TutorRoute", () => {
  it("renders the tutor workspace only after the tutor class list succeeds", async () => {
    tutorApi.getTutorClasses.mockResolvedValue({ items: [], page: 1, size: 1, total_items: 0, total_pages: 0 });

    renderRoute();

    expect(await screen.findByRole("heading", { name: "Tutor classes" })).toBeInTheDocument();
    expect(tutorApi.getTutorClasses).toHaveBeenCalledWith(
      { page: 1, size: 1, sort: "created_at,desc" },
      expect.anything(),
    );
  });

  it("keeps the tutor chrome hidden when the account is not a tutor", async () => {
    tutorApi.getTutorClasses.mockRejectedValue(new ApiError({
      status: 403, error: "Forbidden", message: "not a tutor",
      code: "FORBIDDEN", timestamp: new Date().toISOString(), path: "/tutor/classes",
    }));

    renderRoute();

    expect(await screen.findByText("Tutor workspace is not available to your account")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tutor classes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Tutor navigation" })).not.toBeInTheDocument();
  });
});
