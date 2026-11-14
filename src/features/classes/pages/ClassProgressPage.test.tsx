import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { outlineProgress, recommendation } from "@/test/fixtures/recommendation";
import ClassProgressPage from "./ClassProgressPage";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ state: { status: "authenticated", user: { fullName: "Student" } }, logout: vi.fn() }) }));

it("hosts the same recommendation flow on the existing Student Progress route", async () => {
  const base = "http://localhost:8081/api/v1/classes/class-123";
  server.use(http.get(`${base}/progress`, () => HttpResponse.json(outlineProgress())),
    http.get(`${base}/resume-target`, () => HttpResponse.json(outlineProgress().resume_target)),
    http.get(`${base}/recommended-activities`, () => HttpResponse.json(recommendation())));
  render(<MemoryRouter initialEntries={["/classes/class-123/progress"]}><Routes>
    <Route path="/classes/:classId/progress" element={<ClassProgressPage />} />
    <Route path="/classes/:classId/lessons/:lessonId/activities/:activityId" element={<h1>Existing Quiz activity route</h1>} />
  </Routes></MemoryRouter>);
  expect(await screen.findByText("Practice: Java Variables")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Back to class/ })).toHaveAttribute("href", "/classes/class-123");
  fireEvent.click(screen.getByRole("button", { name: "Open recommended Quiz" }));
  expect(await screen.findByRole("heading", { name: "Existing Quiz activity route" })).toBeInTheDocument();
});
