import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/apiError";

const api = vi.hoisted(() => ({ createContentReport: vi.fn() }));
vi.mock("../api/contentReportApi", () => api);

import ReportContentModal from "./ReportContentModal";

function renderModal(onClose = vi.fn(), onSubmitted = vi.fn()) {
  render(
    <App>
      <ReportContentModal
        open
        contentType="DISCUSSION"
        contentId="discussion-1"
        contentTitle="Week 1 questions"
        onClose={onClose}
        onSubmitted={onSubmitted}
      />
    </App>,
  );
  return { onClose, onSubmitted };
}

function reportFailure(status: number, code: string) {
  return new ApiError({
    status, error: "Request Failed", message: "The server refused the request.", code,
    timestamp: new Date().toISOString(), path: "/content-reports",
  });
}

describe("ReportContentModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.createContentReport.mockResolvedValue({
      report_id: "report-1", content_type: "DISCUSSION", content_id: "discussion-1",
      reason: "SPAM", status: "PENDING", created_at: "2026-11-01T00:00:00Z",
    });
  });

  it("offers exactly the four documented reasons", () => {
    renderModal();
    for (const label of ["Spam or advertising", "Harassment or bullying", "Inappropriate content", "Other"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText("PENDING_REVIEW")).not.toBeInTheDocument();
  });

  it("refuses to submit without a reason and sends the chosen one", async () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByText("Choose a reason for this report.")).toBeInTheDocument();
    expect(api.createContentReport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Harassment or bullying"));
    fireEvent.change(screen.getByPlaceholderText("Add context that helps a moderator review this report."), {
      target: { value: "  Repeated insults  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    await waitFor(() => expect(api.createContentReport).toHaveBeenCalledWith({
      content_type: "DISCUSSION", content_id: "discussion-1", reason: "HARASSMENT", description: "  Repeated insults  ",
    }));
    expect(await screen.findByText("Thank you. Your report has been submitted.")).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("keeps the modal open and explains a duplicate report", async () => {
    api.createContentReport.mockRejectedValue(reportFailure(409, "DUPLICATE_CONTENT_REPORT"));
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText("Other"));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByText("You have already reported this content.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Submit report" })).toBeEnabled();
  });

  it("reports inaccessible content without pretending it succeeded", async () => {
    api.createContentReport.mockRejectedValue(reportFailure(403, "FORBIDDEN"));
    renderModal();
    fireEvent.click(screen.getByText("Spam or advertising"));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByText("You need an active membership in this class to read or post here.")).toBeInTheDocument();
    expect(screen.queryByText("Thank you. Your report has been submitted.")).not.toBeInTheDocument();
  });
  it.each(["discussion-1", "discussion-2"])("discards canceled drafts and validation when reopening %s", async (nextId) => {
    const onClose = vi.fn();
    const props = { open: true, contentType: "DISCUSSION" as const, contentId: "discussion-1", contentTitle: "First post", onClose };
    const view = render(<App><ReportContentModal {...props} /></App>);
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await screen.findByText("Choose a reason for this report.");
    fireEvent.click(screen.getByText("Harassment or bullying"));
    fireEvent.change(screen.getByLabelText("Details (optional)"), { target: { value: "Only about A" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    view.rerender(<App><ReportContentModal {...props} open={false} /></App>);
    view.rerender(<App><ReportContentModal {...props} contentId={nextId} contentTitle="New session" /></App>);
    expect(screen.getByLabelText("Details (optional)")).toHaveValue("");
    expect(screen.getByRole("radio", { name: "Harassment or bullying" })).not.toBeChecked();
    expect(screen.queryByText("Choose a reason for this report.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Other"));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() => expect(api.createContentReport).toHaveBeenCalledWith({ content_type: "DISCUSSION", content_id: nextId, reason: "OTHER", description: undefined }));
    await waitFor(() => expect(screen.getByLabelText("Details (optional)")).toHaveValue(""));
    expect(screen.getByRole("radio", { name: "Other" })).not.toBeChecked();
  });

  it.each(["resolve", "reject"])("isolates a new MATERIAL target from a pending old request (%s)", async (completion) => {
    let resolve!: (value: unknown) => void;
    let reject!: (error: unknown) => void;
    api.createContentReport.mockReturnValue(new Promise((res, rej) => { resolve = res; reject = rej; }));
    const onClose = vi.fn();
    const onSubmitted = vi.fn();
    const props = { open: true, contentType: "DISCUSSION" as const, contentId: "discussion-1", contentTitle: "First post", onClose, onSubmitted };
    const view = render(<App><ReportContentModal {...props} /></App>);
    fireEvent.click(screen.getByText("Spam or advertising"));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() => expect(api.createContentReport).toHaveBeenCalledTimes(1));
    view.rerender(<App><ReportContentModal {...props} contentType="MATERIAL" contentId="material-2" contentTitle="Second target" /></App>);
    expect(screen.getByRole("button", { name: "Submit report" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Details (optional)"), { target: { value: "New material draft" } });
    await act(async () => {
      if (completion === "resolve") resolve({ report_id: "old-report" });
      else reject(reportFailure(409, "DUPLICATE_CONTENT_REPORT"));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Details (optional)")).toHaveValue("New material draft");
    expect(screen.queryByText("You have already reported this content.")).not.toBeInTheDocument();
    expect(screen.queryByText("Thank you. Your report has been submitted.")).not.toBeInTheDocument();
    api.createContentReport.mockResolvedValue({ report_id: "new-report" });
    fireEvent.click(screen.getByText("Other"));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() => expect(api.createContentReport).toHaveBeenLastCalledWith({ content_type: "MATERIAL", content_id: "material-2", reason: "OTHER", description: "New material draft" }));
  });

});