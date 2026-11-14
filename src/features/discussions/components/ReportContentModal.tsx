import { useState } from "react";
import { Alert, App, Form, Input, Modal, Radio, Typography } from "antd";

import { createContentReport } from "../api/contentReportApi";
import type { ContentReportReason, ContentReportResponse, ReportableContentType } from "../types";
import { discussionErrorText } from "../utils/discussionErrorText";
import { REPORT_REASONS, REPORT_SUBMITTED_MESSAGE } from "../utils/reportReasons";

interface ReportContentModalProps {
  open: boolean;
  contentType: ReportableContentType;
  contentId: string;
  contentTitle: string;
  onClose: () => void;
  onSubmitted?: (report: ContentReportResponse) => void;
}

interface ReportFormValues {
  reason: ContentReportReason;
  description?: string;
}

export default function ReportContentModal({
  open,
  contentType,
  contentId,
  contentTitle,
  onClose,
  onSubmitted,
}: ReportContentModalProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<ReportFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submit() {
    let values: ReportFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const report = await createContentReport({
        content_type: contentType,
        content_id: contentId,
        reason: values.reason,
        description: values.description,
      });
      message.success(REPORT_SUBMITTED_MESSAGE);
      form.resetFields();
      onSubmitted?.(report);
      onClose();
    } catch (cause) {
      setError(discussionErrorText(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Report content"
      open={open}
      afterOpenChange={(visible) => { if (visible) setError(undefined); }}
      onCancel={onClose}
      onOk={() => void submit()}
      confirmLoading={submitting}
      okText="Submit report"
      cancelText="Cancel"
      okButtonProps={{ disabled: submitting }}
    >
      <Typography.Paragraph type="secondary">
        Reporting {contentType === "DISCUSSION" ? "post" : "material"} “{contentTitle}”. A moderator
        reviews the report; the content stays visible to the class.
      </Typography.Paragraph>
      {error && <Alert type="error" showIcon title="Report could not be submitted" description={error} />}
      <Form form={form} layout="vertical" requiredMark={false} disabled={submitting}>
        <Form.Item
          name="reason"
          label="Reason"
          rules={[{ required: true, message: "Choose a reason for this report." }]}
        >
          <Radio.Group>
            {REPORT_REASONS.map((reason) => (
              <Radio key={reason.value} value={reason.value} style={{ display: "block", height: 32, lineHeight: "32px" }}>
                {reason.label}
              </Radio>
            ))}
          </Radio.Group>
        </Form.Item>
        <Form.Item name="description" label="Details (optional)">
          <Input.TextArea rows={3} placeholder="Add context that helps a moderator review this report." />
        </Form.Item>
      </Form>
    </Modal>
  );
}