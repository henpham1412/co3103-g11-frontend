import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Card, Empty, Form, Input, Modal, Pagination, Popconfirm, Spin, Tag, Typography } from "antd";
import { ArrowLeftOutlined, FlagOutlined } from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import dayjs from "dayjs";

import { normalizeApiError } from "@/api/apiError";
import type { ClassCatalogItem } from "../../classes/types";
import { createReply, deleteDiscussion, getDiscussion, updateDiscussion } from "../api/discussionApi";
import type { DiscussionDetail, DiscussionPost } from "../types";
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
  lessonId?: string;
}

interface ThreadState {
  requestKey: string;
  post?: DiscussionDetail;
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
  lessonId,
}: DiscussionThreadViewProps) {
  const { message } = App.useApp();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const navigate = useNavigate();
  const [replyForm] = Form.useForm<ReplyValues>();
  const [editForm] = Form.useForm<ReplyValues>();
  const [readRequest, setReadRequest] = useState<{ page: number; revision: number; publishedReplyId?: string }>({ page: 1, revision: 0 });
  const [result, setResult] = useState<ThreadState>();
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState<string>();
  const [editTarget, setEditTarget] = useState<DiscussionPost>();
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string>();
  const [deleting, setDeleting] = useState<string>();
  const [reportTarget, setReportTarget] = useState<DiscussionPost>();

  const requestKey = `${classItem.class_id}:${lessonId ?? ""}:${discussionId}:${readRequest.page}:${readRequest.revision}`;
  const loading = result?.requestKey !== requestKey;
  const data = loading ? undefined : result;
  const post = data?.post;
  const archived = classItem.status === "ARCHIVED";
  const boardPath = `${basePath}${lessonId ? `?lesson_id=${encodeURIComponent(lessonId)}` : ""}`;
  const threadPath = (id: string) => `${basePath}/${id}${lessonId ? `?lesson_id=${encodeURIComponent(lessonId)}` : ""}`;

  function reload(page = result?.post?.replies.page ?? readRequest.page) {
    setReadRequest((request) => ({ page, revision: request.revision + 1 }));
  }

  useEffect(() => {
    const controller = new AbortController();
    async function read() {
      try {
        const readPage = (page: number) => getDiscussion(discussionId, { page, size: 20 }, controller.signal);
        const matchesContext = (response: DiscussionDetail) => response.class_id === classItem.class_id
          && (!lessonId || response.lesson_id === lessonId);
        const containsPublishedReply = (response: DiscussionDetail) => response.replies.items.some(
          (reply) => reply.discussion_id === readRequest.publishedReplyId,
        );
        let response = await readPage(readRequest.page);
        if (controller.signal.aborted) return;
        if (matchesContext(response)) {
          const lastPage = Math.max(1, response.replies.total_pages);
          if (readRequest.page > lastPage || (readRequest.publishedReplyId
            && !containsPublishedReply(response) && readRequest.page !== lastPage)) {
            response = await readPage(lastPage);
          }
        }
        if (controller.signal.aborted) return;
        if (!matchesContext(response)) {
          setResult({ requestKey, error: "This post belongs to a different discussion context.", status: 404 });
        } else if (readRequest.publishedReplyId && !containsPublishedReply(response)) {
          // ASC creation time + UUID ordering does not guarantee the new reply is last.
          // Its canonical detail route is reliable even if concurrent writes shift pages.
          navigate(`${basePath}/${readRequest.publishedReplyId}${lessonId ? `?lesson_id=${encodeURIComponent(lessonId)}` : ""}`);
        } else {
          setResult({ requestKey, post: response });
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        const failure = normalizeApiError(cause);
        setResult({ requestKey, error: discussionErrorText(cause), status: failure.status });
      }
    }
    void read();
    return () => controller.abort();
  }, [discussionId, requestKey, readRequest, classItem.class_id, lessonId, basePath, navigate]);

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
    if (!active.current) return;
    setReplying(true);
    setReplyError(undefined);
    try {
      const title = optionalDiscussionTitle(values.title ?? "");
      const reply = await createReply(discussionId, { content: values.content, ...(title ? { title } : {}) });
      if (!active.current) return;
      setReadRequest((request) => ({
        page: post?.replies.page ?? request.page,
        revision: request.revision + 1,
        publishedReplyId: reply.discussion_id,
      }));
      replyForm.resetFields();
      message.success("Your reply was published.");
    } catch (cause) {
      if (!active.current) return;
      setReplyError(discussionErrorText(cause));
      if (isStaleDiscussionState(cause)) reload();
    } finally {
      if (active.current) setReplying(false);
    }
  }

  async function saveEdit() {
    if (!editTarget) return;
    const targetId = editTarget.discussion_id;
    let values: ReplyValues;
    try {
      values = await editForm.validateFields();
    } catch {
      return;
    }
    if (!active.current) return;
    setSaving(true);
    setEditError(undefined);
    try {
      const title = optionalDiscussionTitle(values.title ?? "");
      await updateDiscussion(targetId, { content: values.content, ...(title ? { title } : {}) });
      if (!active.current) return;
      reload();
      setEditTarget(undefined);
      message.success("Post updated.");
    } catch (cause) {
      if (!active.current) return;
      setEditError(discussionErrorText(cause));
      if (isStaleDiscussionState(cause)) reload();
    } finally {
      if (active.current) setSaving(false);
    }
  }

  async function removePost(target: DiscussionPost) {
    setDeleting(target.discussion_id);
    try {
      await deleteDiscussion(target.discussion_id);
      if (!active.current) return;
      message.success("Post deleted.");
      if (target.discussion_id === discussionId) navigate(boardPath, { replace: true });
      else reload();
    } catch (cause) {
      if (!active.current) return;
      message.error(discussionErrorText(cause));
      if (isStaleDiscussionState(cause)) reload();
    } finally {
      if (active.current) setDeleting(undefined);
    }
  }

  function openEditor(target: DiscussionPost) {
    editForm.setFieldsValue({ title: target.title ?? "", content: target.content });
    setEditError(undefined);
    setEditTarget(target);
  }

  function postActions(target: DiscussionPost) {
    const canModerate = target.author_id === currentUserId || classItem.tutor.user_id === currentUserId;
    return (
      <div className="discussions__post-actions">
        <Button size="small" icon={<FlagOutlined />} onClick={() => setReportTarget(target)}>Report</Button>
        {canModerate && !archived && <>
          <Button size="small" disabled={saving} onClick={() => openEditor(target)}>Edit</Button>
          <Popconfirm title="Delete this post?"
            description="The server refuses deletion while replies or an open report depend on it."
            okText="Delete" okButtonProps={{ danger: true, loading: deleting === target.discussion_id }}
            onConfirm={() => void removePost(target)}>
            <Button size="small" danger loading={deleting === target.discussion_id}>Delete</Button>
          </Popconfirm>
        </>}
      </div>
    );
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
      <Alert type="error" showIcon title="Could not load this post" description={data.error} action={<Button size="small" onClick={() => setReadRequest((request) => ({ ...request, revision: request.revision + 1 }))}>Retry</Button>} />
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
          {post.lesson_id && <div><Link to={`/classes/${classItem.class_id}/lessons/${post.lesson_id}`}>Back to lesson</Link></div>}
          {post.parent_id && <div><Link to={threadPath(post.parent_id)}>View parent post</Link></div>}
          <Typography.Paragraph className="discussions__post-body">{post.content}</Typography.Paragraph>
          {postActions(post)}
        </Card>

        <section className="discussions__replies" aria-labelledby="discussion-replies-heading">
          <Typography.Title id="discussion-replies-heading" level={5}>Replies</Typography.Title>
          <Button size="small" onClick={() => reload()}>Refresh replies</Button>
          {post.replies.items.length === 0 ? (
            <Empty description="No replies yet." />
          ) : (
            <div className="discussions__list">
              {post.replies.items.map((reply) => (
                <Card key={reply.discussion_id} className="discussions__post" size="small">
                  <div className="discussions__post-head">
                    <Typography.Text strong>{reply.title ?? "Reply"}</Typography.Text>
                    <Tag>{dayjs(reply.created_at).format("D MMM YYYY, HH:mm")}</Tag>
                  </div>
                  <Typography.Text type="secondary">{discussionAuthorLabel(reply.author_id, authorContext)}</Typography.Text>
                  <div><Link to={threadPath(reply.parent_id ?? discussionId)}>View parent post</Link></div>
                  <Typography.Paragraph className="discussions__post-body">{reply.content}</Typography.Paragraph>
                  <Link to={threadPath(reply.discussion_id)}>Open reply and conversation</Link>
                  {postActions(reply)}
                </Card>
              ))}
            </div>
          )}
          {post.replies.total_pages > 1 && (
            <Pagination current={post.replies.page} pageSize={post.replies.size}
              total={post.replies.total_items} showSizeChanger={false} onChange={(page) => reload(page)} />
          )}

          {archived ? (
            <Alert type="info" showIcon title="This class is archived" description="The server no longer accepts new replies." />
          ) : (
            <Form name="discussion-reply" form={replyForm} layout="vertical" requiredMark={false} disabled={replying} className="discussions__reply-form">
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
          open={Boolean(editTarget)}
          onCancel={() => { if (!saving) setEditTarget(undefined); }}
          closable={!saving}
          maskClosable={!saving}
          cancelButtonProps={{ disabled: saving }}
          onOk={() => void saveEdit()}
          confirmLoading={saving}
          okText="Save changes"
          cancelText="Cancel"
        >
          {editError && <Alert type="error" showIcon title="Post could not be updated" description={editError} />}
          <Form name="discussion-edit" form={editForm} layout="vertical" requiredMark={false} disabled={saving}>
            <Form.Item
              name="title"
              label="Title"
              rules={[{
                validator: (_, value: string) => {
                  const error = validateDiscussionTitle(value ?? "", editTarget?.parent_id === null);
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

      </>
    );
  }

  return (
    <section className="discussions" aria-labelledby="discussion-thread-heading">
      <div className="discussions__header">
        <Typography.Title id="discussion-thread-heading" level={3}>Discussion thread</Typography.Title>
        <Link to={boardPath}><Button icon={<ArrowLeftOutlined />}>Back to discussions</Button></Link>
      </div>
      {content}
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