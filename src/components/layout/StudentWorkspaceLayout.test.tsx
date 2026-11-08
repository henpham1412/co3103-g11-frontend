import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  state: { status: "authenticated", user: { fullName: "Nguyen Van A" } },
  logout: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

import StudentWorkspaceLayout from "./StudentWorkspaceLayout";

describe("StudentWorkspaceLayout", () => {
  beforeEach(() => auth.logout.mockClear());

  it("uses the signed-in user's name and keeps administrative links out of student navigation", () => {
    render(<MemoryRouter initialEntries={["/classes"]}><StudentWorkspaceLayout currentPage="Class Catalog"><div>Page</div></StudentWorkspaceLayout></MemoryRouter>);
    expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Student navigation" })).toHaveTextContent("DashboardClassesDiscussion");
    expect(screen.queryByRole("link", { name: /Users/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Basic Reports/ })).not.toBeInTheDocument();
  });

  it("logs out through the shared FE-1 authentication provider", () => {
    render(<MemoryRouter><StudentWorkspaceLayout currentPage="Classes"><div>Page</div></StudentWorkspaceLayout></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(auth.logout).toHaveBeenCalledWith("signed-out");
  });
});
