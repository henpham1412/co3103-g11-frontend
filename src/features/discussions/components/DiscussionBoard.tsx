import { useCallback, useEffect, useState } from "react";
import { Alert, App, Button, Card, Empty, Form, Input, Modal, Pagination, Spin, Tag, Typography } from "antd";
import { FlagOutlined, PlusOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import dayjs from "dayjs";

import type { ClassCatalogItem } from "../../classes/types";
import { normalizeApiError } from "@/api/apiError";
import { createDiscussion, listClassDiscussions } from "../api/discussionApi";
import type { DiscussionPage, DiscussionPost } from "../types";
import { discussionAuthorLabel } from "../utils/authorLabel";
import { discussionErrorText } from "../utils/discussionErrorText";
import { DISCUSSION_TITLE_MAX_LENGTH, validateDiscussionContent, validateDiscussionTitle } from "../utils/discussionValidation";
import ReportContentModal from "./ReportContentModal";
import "../discussions.css";

const PAGE_SIZE = 20;

interface DiscussionBoardProps {
  classItem: ClassCatalogItem;
  currentUserId?: string;
  currentUserName?: string;
  basePath: string;
}

interface BoardState {
  requestKey: string;
  page?: DiscussionPage;
  error?: string;
  status?: number;
}

interface NewPostValues {
  title: string;
  content: string;
}

export default function DiscussionBoard({ classItem, currentUserId, currentUserName, basePath }: DiscussionBoardProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<NewPostValues>();
  const [page, setPage] = useState(1);
  const [readToken, setReadToken] = useState(0);
  const [result, setResult] = useState<BoardState>();
  const [composerOpen, setComposerOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string>();
  const [reportTarget, setReportTarget] = useState<DiscussionPost>();

  const requestKey = `${classItem.class_id}:${page}:${readToken}`;
  const loading = result?.requestKey !== requestKey;
  const data = loading ? undefined : result;
  const archived = classItem.status === "ARCHIVED";

  const reload = useCallback(() => setReadToken((token) => token + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    listClassDiscussions(classItem.class_id, { page, size: PAGE_SIZE }, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setResult({ requestKey, page: response });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const failure = normalizeApiError(cause);
        setResult({ requestKey, error: discussionErrorText(cause), status: failure.status });
      });
    return () => controller.abort();
  }, [classItem.class_id, page, requestKey]);

  async function submitPost() {
    let values: NewPostValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setPosting(true);
    setPostError(undefined);
    try {
      await createDiscussion(classItem.class_id, { title: values.title.trim(), content: values.content });
      message.success("Your post was published.");
      form.resetFields();
      setComposerOpen(false);
      setPage(1);
      reload();
    } catch (cause) {
      setPostError(discussionErrorText(cause));
    } finally {
      setPosting(false);
    }
  }

  const authorContext = {
    currentUserId,
    currentUserFullName: currentUserName,
    tutorUserId: classItem.tutor.user_id,
    tutorFullName: classItem.tutor.full_name,
  };

  let content;
  if (loading) {
    content = <div className="discussions__loading" role="status" aria-live="polite"><Spin /><span>Loading discussions…</span></div>;
  } else if (data?.error) {
    content = data.status === 403 ? (
      <Alert
        type="warning"
        showIcon
        title="You cannot read this class discussion"
        description="Only active members and the class tutor can read and post here. Join the class or wait for tutor approval."
      />
    ) : (
      <Alert
        type="error"
        showIcon
        title="Could not load the discussions"
        description={data.error}
        action={<Button size="small" onClick={reload}>Retry</Button>}
      />
    );
  } else if (!data?.page?.items.length) {
    content = <Empty description="No discussions in this class yet. Start the first one." />;
  } else {
    content = (
      <>
        <div className="discussions__list">
          {data.page.items.map((post) => (
            <Card key={post.discussion_id} className="discussions__post" size="small">
              <div className="discussions__post-head">
                <Typography.Text strong>{post.title ?? "Untitled post"}</Typography.Text>
                <Tag>{dayjs(post.created_at).format("D MMM YYYY, HH:mm")}</Tag>
              </div>
              <Typography.Text type="secondary">
                {discussionAuthorLabel(post.author_id, authorContext)}
              </Typography.Text>
              <Typography.Paragraph ellipsis={{ rows: 2 }} className="discussions__post-body">
                {post.content}
              </Typography.Paragraph>
              <div className="discussions__post-actions">
                <Link to={`${basePath}/${post.discussion_id}`}>
                  <Button type="primary" size="small">Open thread</Button>
                </Link>
                <Button size="small" icon={<FlagOutlined />} onClick={() => setReportTarget(post)}>Report</Button>
              </div>
            </Card>
          ))}
        </div>
        {data.page.total_pages > 1 && (
          <Pagination
            className="discussions__pagination"
            current={data.page.page}
            pageSize={data.page.size}
            total={data.page.total_items}
            showSizeChanger={false}
            onChange={setPage}
          />
        )}
      </>
    );
  }

  return (
    <section className="discussions" aria-labelledby="discussions-heading">
      <div className="discussions__header">
        <div>
          <Typography.Title id="discussions-heading" level={3}>Discussions</Typography.Title>
          <Typography.Text type="secondary">{classItem.title} · {classItem.class_code}</Typography.Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={archived}
          onClick={() => { setPostError(undefined); setComposerOpen(true); }}
        >
          New post
        </Button>
      </div>
      {archived && (
        <Alert type="info" showIcon title="This class is archived" description="Existing posts stay readable, but the server no longer accepts new ones." />
      )}
      {content}

      <Modal
        title="Start a discussion"
        open={composerOpen}
        onCancel={() => setComposerOpen(false)}
        onOk={() => void submitPost()}
        confirmLoading={posting}
        okText="Publish post"
        cancelText="Cancel"
      >
        {postError && <Alert type="error" showIcon title="Post could not be published" description={postError} />}
        <Form form={form} layout="vertical" requiredMark={false} disabled={posting}>
          <Form.Item
            name="title"
            label="Title"
            extra={`Up to ${DISCUSSION_TITLE_MAX_LENGTH} characters.`}
            rules={[{
              validator: (_, value: string) => {
                const error = validateDiscussionTitle(value ?? "", true);
                return error ? Promise.reject(new Error(error)) : Promise.resolve();
              },
            }]}
          >
            <Input placeholder="What is this discussion about?" />
          </Form.Item>
          <Form.Item
            name="content"
            label="Message"
            rules={[{
              validator: (_, value: string) => {
                const error = validateDiscussionContent(value ?? "");
                return error ? Promise.reject(new Error(error)) : Promise.resolve();
              },
            }]}
          >
            <Input.TextArea rows={5} placeholder="Write your question or explanation." />
          </Form.Item>
        </Form>
      </Modal>

      <ReportContentModal
        open={Boolean(reportTarget)}
        contentType="DISCUSSION"
        contentId={reportTarget?.discussion_id ?? ""}
        contentTitle={reportTarget?.title ?? "Untitled post"}
        onClose={() => setReportTarget(undefined)}
      />
    </section>
  );
}