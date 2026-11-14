import { useCallback, useEffect, useState } from "react";
import { Alert, App, Button, Card, Empty, Form, Input, Modal, Popconfirm, Spin, Tag, Typography } from "antd";
import { ArrowLeftOutlined, FlagOutlined } from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import dayjs from "dayjs";

import { normalizeApiError } from "@/api/apiError";
import type { ClassCatalogItem } from "../../classes/types";
import { createReply, deleteDiscussion, getDiscussion, updateDiscussion } from "../api/discussionApi";
import type { DiscussionPost } from "../types";
import { discussionAuthorLabel } from "../utils/authorLabel";
import { discussionErrorText, isStaleDiscussionState } from "../utils/discussionErrorText";
import { optionalDiscussionTitle, validateDiscussionContent, validateDiscussionTitle } from "../utils/discussionValidation";
import ReportContentModal from "./ReportContentModal";
import "../discussions.css";

interface DiscussionThreadViewProps {
  classItem: ClassCatalogItem;
  discussionId: string;
  currentUserId?: string;
  currentUserName?: string;
  basePath: string;
}

interface ThreadState {
  requestKey: string;
  post?: DiscussionPost;
  error?: string;
  status?: number;
}

interface ReplyValues {
  title?: string;
  content: string;
}

export default function DiscussionThreadView({
  classItem,
  discussionId,
  currentUserId,
  currentUserName,
  basePath,
}: DiscussionThreadViewProps) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [replyForm] = Form.useForm<ReplyValues>();
  const [editForm] = Form.useForm<ReplyValues>();
  const [readToken, setReadToken] = useState(0);
  const [result, setResult] = useState<ThreadState>();
  // POST /discussions/{id}/replies stores a reply, but no endpoint reads replies back: the list
  // returns root threads only and the detail returns one post. Replies written in this session are
  // kept here so the author sees their own post; they are not a reconstruction of the stored thread.
  const [sessionReplies, setSessionReplies] = useState<DiscussionPost[]>([]);
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const requestKey = `${discussionId}:${readToken}`;
  const loading = result?.requestKey !== requestKey;
  const data = loading ? undefined : result;
  const post = data?.post;
  const archived = classItem.status === "ARCHIVED";
  const canModerate = Boolean(post) && (post?.author_id === currentUserId || classItem.tutor.user_id === currentUserId);

  const reload = useCallback(() => setReadToken((token) => token + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    getDiscussion(discussionId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setResult({ requestKey, post: response });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const failure = normalizeApiError(cause);
        setResult({ requestKey, error: discussionErrorText(cause), status: failure.status });
      });
    return () => controller.abort();
  }, [discussionId, requestKey]);

  const authorContext = {
    currentUserId,
    currentUserFullName: currentUserName,
    tutorUserId: classItem.tutor.user_id,
    tutorFullName: classItem.tutor.full_name,
  };

  async function submitReply() {
    let values: ReplyValues;
    try {
      values = await replyForm.validateFields();
    } catch {
      return;
    }
    setReplying(true);
    setReplyError(undefined);
    try {
      const title = optionalDiscussionTitle(values.title ?? "");
      const reply = await createReply(discussionId, { content: values.content, ...(title ? { title } : {}) });
      setSessionReplies((replies) => [...replies, reply]);
      replyForm.resetFields();
      message.success("Your reply was published.");
    } catch (cause) {
      setReplyError(discussionErrorText(cause));
      if (isStaleDiscussionState(cause)) reload();
    } finally {
      setReplying(false);
    }
  }

  async function saveEdit() {
    let values: ReplyValues;
    try {
      values = await editForm.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    setEditError(undefined);
    try {
      const title = optionalDiscussionTitle(values.title ?? "");
      const updated = await updateDiscussion(discussionId, { content: values.content, ...(title ? { title } : {}) });
      setResult({ requestKey, post: updated });
      setEditing(false);
      message.success("Post updated.");
    } catch (cause) {
      setEditError(discussionErrorText(cause));
      if (isStaleDiscussionState(cause)) reload();
    } finally {
      setSaving(false);
    }
  }

  async function removePost() {
    setDeleting(true);
    try {
      await deleteDiscussion(discussionId);
      message.success("Post deleted.");
      navigate(basePath, { replace: true });
    } catch (cause) {
      message.error(discussionErrorText(cause));
      if (isStaleDiscussionState(cause)) reload();
    } finally {
      setDeleting(false);
    }
  }

  function openEditor() {
    editForm.setFieldsValue({ title: post?.title ?? "", content: post?.content ?? "" });
    setEditError(undefined);
    setEditing(true);
  }

  let content;
  if (loading) {
    content = <div className="discussions__loading" role="status" aria-live="polite"><Spin /><span>Loading post…</span></div>;
  } else if (data?.error) {
    content = data.status === 403 ? (
      <Alert type="warning" showIcon title="You cannot read this post" description="Only active members and the class tutor can read this discussion." />
    ) : data.status === 404 ? (
      <Alert type="warning" showIcon title="Post is unavailable" description="It may have been deleted, or it belongs to another class." />
    ) : (
      <Alert type="error" showIcon title="Could not load this post" description={data.error} action={<Button size="small" onClick={reload}>Retry</Button>} />
    );
  } else if (!post) {
    content = <Empty description="This post is no longer available." />;
  } else {
    content = (
      <>
        <Card className="discussions__thread-post">
          <div className="discussions__post-head">
            <Typography.Title level={4}>{post.title ?? "Untitled post"}</Typography.Title>
            <Tag>{dayjs(post.created_at).format("D MMM YYYY, HH:mm")}</Tag>
          </div>
          <Typography.Text type="secondary">{discussionAuthorLabel(post.author_id, authorContext)}</Typography.Text>
          <Typography.Paragraph className="discussions__post-body">{post.content}</Typography.Paragraph>
          <div className="discussions__post-actions">
            <Button size="small" icon={<FlagOutlined />} onClick={() => setReportOpen(true)}>Report</Button>
            {canModerate && !archived && (
              <>
                <Button size="small" onClick={openEditor}>Edit</Button>
                <Popconfirm
                  title="Delete this post?"
                  description="The server refuses deletion while replies or an open report depend on it."
                  okText="Delete"
                  okButtonProps={{ danger: true, loading: deleting }}
                  onConfirm={() => void removePost()}
                >
                  <Button size="small" danger loading={deleting}>Delete</Button>
                </Popconfirm>
              </>
            )}
          </div>
        </Card>

        <section className="discussions__replies" aria-labelledby="discussion-replies-heading">
          <Typography.Title id="discussion-replies-heading" level={5}>Replies</Typography.Title>
          <Alert
            type="info"
            showIcon
            title="Replies are write-only in the current LMS build"
            description="You can publish a reply, but the API has no endpoint that reads replies back. Only replies posted in this session are listed below; reload the page and they are gone from this view even though the server keeps them."
          />
          {sessionReplies.length === 0 ? (
            <Empty description="No replies posted in this session." />
          ) : (
            <div className="discussions__list">
              {sessionReplies.map((reply) => (
                <Card key={reply.discussion_id} className="discussions__post" size="small">
                  <div className="discussions__post-head">
                    <Typography.Text strong>{reply.title ?? "Reply"}</Typography.Text>
                    <Tag>{dayjs(reply.created_at).format("D MMM YYYY, HH:mm")}</Tag>
                  </div>
                  <Typography.Text type="secondary">{discussionAuthorLabel(reply.author_id, authorContext)}</Typography.Text>
                  <Typography.Paragraph className="discussions__post-body">{reply.content}</Typography.Paragraph>
                </Card>
              ))}
            </div>
          )}

          {archived ? (
            <Alert type="info" showIcon title="This class is archived" description="The server no longer accepts new replies." />
          ) : (
            <Form form={replyForm} layout="vertical" requiredMark={false} disabled={replying} className="discussions__reply-form">
              {replyError && <Alert type="error" showIcon title="Reply could not be published" description={replyError} />}
              <Form.Item
                name="title"
                label="Reply title (optional)"
                rules={[{
                  validator: (_, value: string) => {
                    const error = validateDiscussionTitle(value ?? "", false);
                    return error ? Promise.reject(new Error(error)) : Promise.resolve();
                  },
                }]}
              >
                <Input placeholder="Leave empty to reply without a title." />
              </Form.Item>
              <Form.Item
                name="content"
                label="Reply"
                rules={[{
                  validator: (_, value: string) => {
                    const error = validateDiscussionContent(value ?? "");
                    return error ? Promise.reject(new Error(error)) : Promise.resolve();
                  },
                }]}
              >
                <Input.TextArea rows={4} placeholder="Write your reply." />
              </Form.Item>
              <Button type="primary" loading={replying} onClick={() => void submitReply()}>Publish reply</Button>
            </Form>
          )}
        </section>

        <Modal
          title="Edit post"
          open={editing}
          onCancel={() => setEditing(false)}
          onOk={() => void saveEdit()}
          confirmLoading={saving}
          okText="Save changes"
          cancelText="Cancel"
        >
          {editError && <Alert type="error" showIcon title="Post could not be updated" description={editError} />}
          <Form form={editForm} layout="vertical" requiredMark={false} disabled={saving}>
            <Form.Item
              name="title"
              label="Title"
              rules={[{
                validator: (_, value: string) => {
                  const error = validateDiscussionTitle(value ?? "", post.parent_id === null);
                  return error ? Promise.reject(new Error(error)) : Promise.resolve();
                },
              }]}
            >
              <Input />
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
              <Input.TextArea rows={5} />
            </Form.Item>
          </Form>
        </Modal>

        <ReportContentModal
          open={reportOpen}
          contentType="DISCUSSION"
          contentId={post.discussion_id}
          contentTitle={post.title ?? "Untitled post"}
          onClose={() => setReportOpen(false)}
        />
      </>
    );
  }

  return (
    <section className="discussions" aria-labelledby="discussion-thread-heading">
      <div className="discussions__header">
        <Typography.Title id="discussion-thread-heading" level={3}>Discussion thread</Typography.Title>
        <Link to={basePath}><Button icon={<ArrowLeftOutlined />}>Back to discussions</Button></Link>
      </div>
      {content}
    </section>
  );
}