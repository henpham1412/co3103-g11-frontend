import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Collapse,
  Descriptions,
  Empty,
  App,
  Popconfirm,
  Spin,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { ArrowLeftOutlined, CheckCircleOutlined, TeamOutlined } from "@ant-design/icons";
import { isAxiosError } from "axios";
import { Link, useParams } from "react-router-dom";

import StudentWorkspaceLayout from "../../../components/layout/StudentWorkspaceLayout";
import {
  getClassDetails,
  getClassOutline,
  getCurrentMemberships,
  joinClass,
  leaveClass,
  withdrawJoinRequest,
} from "../api/classApi";
import type { ClassCatalogItem, ClassOutlineResponse, MembershipStatus } from "../types";
import "../class-detail.css";

interface ClassDetailResult {
  requestKey: string;
  data?: ClassCatalogItem;
  error?: string;
}

interface ClassOutlineResult {
  requestKey: string;
  data?: ClassOutlineResponse;
  error?: string;
  membershipRequired?: boolean;
}

interface ClassMembershipResult {
  requestKey: string;
  status?: MembershipStatus;
  error?: string;
}

export default function ClassDetailPage() {
  const { message } = App.useApp();
  const { classId = "" } = useParams();
  // Details, outline and membership are one server-owned snapshot: a membership write moves
  // the seat count and can unlock the outline, so a finished write re-reads all three.
  const [readToken, setReadToken] = useState(0);
  const [detailResult, setDetailResult] = useState<ClassDetailResult | null>(null);
  const [outlineResult, setOutlineResult] = useState<ClassOutlineResult | null>(null);
  const [membershipResult, setMembershipResult] = useState<ClassMembershipResult | null>(null);
  const [joining, setJoining] = useState(false);

  const detailRequestKey = ["detail", classId, readToken].join("|");
  const outlineRequestKey = ["outline", classId, readToken].join("|");
  const membershipRequestKey = ["membership", classId, readToken].join("|");

  const detailLoading = detailResult?.requestKey !== detailRequestKey;
  const classItem = detailLoading ? undefined : detailResult?.data;
  const detailError = detailLoading ? undefined : detailResult?.error;
  const hasClass = classItem !== undefined;
  const outlineLoading = !hasClass || outlineResult?.requestKey !== outlineRequestKey;
  const outline = outlineLoading ? undefined : outlineResult?.data;
  const outlineError = outlineLoading ? undefined : outlineResult?.error;
  const membershipRequired = !outlineLoading && outlineResult?.membershipRequired === true;
  const membershipLoading = membershipResult?.requestKey !== membershipRequestKey;
  const membershipStatusAvailable = !membershipLoading && membershipResult?.error === undefined;
  const membershipStatus = membershipStatusAvailable ? membershipResult?.status ?? null : null;
  const membershipStatusError = membershipLoading ? undefined : membershipResult?.error;
  const isOpenClass = classItem?.enrollment_policy === "OPEN";
  const isFullOpenClass = Boolean(
    classItem
    && isOpenClass
    && classItem.max_capacity !== null
    && classItem.active_member_count >= classItem.max_capacity,
  );

  useEffect(() => {
    if (!classId) return;
    const controller = new AbortController();

    getClassDetails(classId, controller.signal)
      .then((data) => setDetailResult({ requestKey: detailRequestKey, data }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDetailResult({ requestKey: detailRequestKey, error: getErrorMessage(error) });
        }
      });

    return () => controller.abort();
  }, [classId, detailRequestKey]);

  useEffect(() => {
    if (!hasClass) return;
    const controller = new AbortController();

    getClassOutline(classId, controller.signal)
      .then((data) => {
        setOutlineResult({ requestKey: outlineRequestKey, data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const code = getErrorCode(error);
        setOutlineResult({
          requestKey: outlineRequestKey,
          error: code === "MEMBERSHIP_REQUIRED" ? undefined : getErrorMessage(error),
          membershipRequired: code === "MEMBERSHIP_REQUIRED",
        });
      });

    return () => controller.abort();
  }, [classId, hasClass, outlineRequestKey]);

  useEffect(() => {
    if (!classId) return;
    const controller = new AbortController();

    getCurrentMemberships(controller.signal)
      .then((memberships) => {
        const membership = memberships.find((item) => item.class_id === classId);
        setMembershipResult({
          requestKey: membershipRequestKey,
          status: membership?.status === "ACTIVE" || membership?.status === "PENDING"
            ? membership.status
            : undefined,
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setMembershipResult({ requestKey: membershipRequestKey, error: getErrorMessage(error) });
        }
      });

    return () => controller.abort();
  }, [classId, membershipRequestKey]);

  async function handleJoin() {
    if (!classItem || joining) return;
    setJoining(true);
    try {
      const result = await joinClass(classItem.class_id, classItem.enrollment_policy);
      message.success(
        result.status === "ACTIVE"
          ? "You joined the class."
          : "Your request to join was submitted.",
      );
      setReadToken((token) => token + 1);
    } catch (error) {
      const code = getErrorCode(error);
      if (code === "CLASS_FULL" || code === "INVALID_MEMBERSHIP_STATE" || code === "ENROLLMENT_POLICY_CHANGED") {
        // These conflicts mean the server disagrees with this snapshot, so it is re-read.
        if (code === "CLASS_FULL") {
          message.error("This class is full.");
        } else if (code === "INVALID_MEMBERSHIP_STATE") {
          message.warning("Your membership already exists. Refreshing its current status.");
        } else {
          message.error(getErrorMessage(error));
        }
        setReadToken((token) => token + 1);
      } else {
        message.error(getErrorMessage(error));
      }
    } finally {
      setJoining(false);
    }
  }

  async function handleMembershipEnd() {
    if (!classItem || joining || !membershipStatus) return;
    setJoining(true);
    try {
      if (membershipStatus === "ACTIVE") {
        await leaveClass(classItem.class_id);
        message.success("You left the class.");
      } else {
        await withdrawJoinRequest(classItem.class_id);
        message.success("Your join request was withdrawn.");
      }
      setReadToken((token) => token + 1);
    } catch (error) {
      message.error(getErrorMessage(error));
      if (getErrorCode(error) === "INVALID_MEMBERSHIP_STATE") {
        setReadToken((token) => token + 1);
      }
    } finally {
      setJoining(false);
    }
  }

  const currentPage = "Class Catalog > Class Detail";
  const syllabusContent = outlineLoading ? (
    <div className="class-detail__loading" role="status" aria-live="polite">
      <Spin />
      <span>Loading syllabus…</span>
    </div>
  ) : membershipRequired ? (
    <Alert
      type="info"
      showIcon
      title="The syllabus is available to active class members."
      description={membershipStatusError
        ? "Your membership status could not be checked, so join actions are unavailable. Please try again later."
        : membershipStatus === "PENDING"
          ? "Your request is waiting for tutor approval."
          : "Join this class to view its published learning outline."}
    />
  ) : outlineError ? (
    <Alert type="warning" showIcon title="The syllabus could not be loaded" description={outlineError} />
  ) : outline && outline.chapters.length > 0 ? (
    <>
      <div className="class-detail__section-heading">
        <Typography.Title level={4}>Class syllabus</Typography.Title>
        <Typography.Text type="secondary">
          {outline.chapters.length} chapters · {outline.chapters.reduce((total, chapter) => total + chapter.lessons.length, 0)} lessons
        </Typography.Text>
      </div>
      <Collapse
        items={outline.chapters.map((chapter) => ({
          key: chapter.chapter_id,
          label: <strong>Chapter {chapter.sequence_order + 1} · {chapter.title}</strong>,
          children: chapter.lessons.length > 0 ? (
            chapter.lessons.flatMap((lesson) => [
              <div className="class-detail__lesson" key={lesson.lesson_id}>
                <span className="class-detail__lesson-check"><CheckCircleOutlined /></span>
                <Link to={`/classes/${classId}/lessons/${lesson.lesson_id}`}>{lesson.title}</Link>
                {lesson.estimated_duration != null && (
                  <Tag variant="filled">{lesson.estimated_duration} mins</Tag>
                )}
              </div>,
              ...(lesson.activities && lesson.activities.length > 0 ? [
                <div className="class-detail__activities" key={`${lesson.lesson_id}-activities`}>
                  {lesson.activities.map((activity) => (
                    <span className="class-detail__activity" key={activity.activity_id}>
                      <Tag color={activity.activity_type === "QUIZ" ? "blue" : "orange"}>
                        {activity.activity_type === "QUIZ" ? "Quiz" : "Assignment"}
                      </Tag>
                      <Link to={`/classes/${classId}/lessons/${lesson.lesson_id}/activities/${activity.activity_id}`}>
                        {activity.title}
                      </Link>
                    </span>
                  ))}
                </div>,
              ] : []),
            ])
          ) : (
            <Typography.Text type="secondary">No published lessons yet.</Typography.Text>
          ),
        }))}
      />
    </>
  ) : (
    <Empty description="No published syllabus is available yet." />
  );

  return (
    <StudentWorkspaceLayout currentPage={currentPage}>
      <main className="class-detail-page">
        <Link className="class-detail__back" to="/classes">
          <ArrowLeftOutlined /> Back to Class Catalog
        </Link>

        {detailLoading ? (
          <div className="class-detail__loading" role="status" aria-live="polite">
            <Spin />
            <span>Loading class details…</span>
          </div>
        ) : detailError || !classItem ? (
          <Alert type="error" showIcon title="Could not load this class" description={detailError ?? "Class not found."} />
        ) : (
          <>
            <Card className="class-detail__hero">
              <div className="class-detail__hero-top">
                <div>
                  <div className="class-detail__badges">
                    <Typography.Text type="secondary">{classItem.class_code}</Typography.Text>
                    <Tag color={classItem.enrollment_policy === "OPEN" ? "green" : "orange"}>
                      {classItem.enrollment_policy}
                    </Tag>
                    <Tag>{classItem.status}</Tag>
                  </div>
                  <Typography.Title level={2}>{classItem.title}</Typography.Title>
                  <Typography.Paragraph type="secondary">
                    {classItem.description || "No class description is available."}
                  </Typography.Paragraph>
                  <div className="class-detail__quick-facts">
                    <span>
                      <TeamOutlined /> {classItem.active_member_count}/
                      {classItem.max_capacity ?? "—"} Seats
                    </span>
                  </div>
                </div>
              </div>
              <div className="class-detail__tutor">
                <Avatar>{classItem.tutor.full_name.slice(0, 1)}</Avatar>
                <div>
                  <Typography.Text strong>{classItem.tutor.full_name}</Typography.Text>
                  <br />
                  <Typography.Text type="secondary">Tutor</Typography.Text>
                </div>
              </div>
            </Card>

            {membershipStatusError && (
              <Alert
                type="warning"
                showIcon
                title="Membership status is unavailable"
                description="Membership actions are disabled until your status can be loaded."
              />
            )}

            <div className="class-detail__membership-status">
              {membershipStatus === "ACTIVE" && (
                <>
                  <Tag color="green">Enrolled</Tag>
                  <Popconfirm
                    title="Leave this class?"
                    description="You will lose access to this class's learning content."
                    okText="Leave"
                    cancelText="Keep"
                    disabled={joining}
                    onConfirm={handleMembershipEnd}
                  >
                    <Button size="small" loading={joining}>Leave class</Button>
                  </Popconfirm>
                </>
              )}
              {membershipStatus === "PENDING" && (
                <>
                  <Tag color="orange">Request pending</Tag>
                  <Popconfirm
                    title="Withdraw your join request?"
                    description="You can submit a new request later."
                    okText="Withdraw"
                    cancelText="Keep"
                    disabled={joining}
                    onConfirm={handleMembershipEnd}
                  >
                    <Button size="small" loading={joining}>Withdraw request</Button>
                  </Popconfirm>
                </>
              )}
              {membershipStatus !== "ACTIVE" && membershipStatus !== "PENDING" && (
                <Button
                  type="primary"
                  disabled={!membershipStatusAvailable || isFullOpenClass}
                  loading={joining}
                  onClick={handleJoin}
                >
                  {isOpenClass ? "Join Class" : "Request to Join"}
                </Button>
              )}
            </div>

            <Tabs
              className="class-detail__tabs"
              items={[
                { key: "syllabus", label: "Syllabus", children: syllabusContent },
                {
                  key: "information",
                  label: "Class information",
                  children: (
                    <Card>
                      <Descriptions column={{ xs: 1, sm: 2 }}>
                        <Descriptions.Item label="Class code">{classItem.class_code}</Descriptions.Item>
                        <Descriptions.Item label="Enrollment policy">{classItem.enrollment_policy}</Descriptions.Item>
                        <Descriptions.Item label="Prerequisites" span={2}>
                          {classItem.prerequisites_description || "None provided"}
                        </Descriptions.Item>
                      </Descriptions>
                      <Typography.Text type="secondary">
                        Prerequisites are informational and do not block enrollment.
                      </Typography.Text>
                    </Card>
                  ),
                },
                {
                  key: "announcements",
                  label: "Announcements",
                  children: <Empty description="Announcements are not part of this FE-3 implementation." />,
                },
              ]}
            />
          </>
        )}
      </main>
    </StudentWorkspaceLayout>
  );
}

function getErrorCode(error: unknown) {
  if (!isAxiosError<{ code?: string; error?: string }>(error)) return undefined;
  return error.response?.data?.code ?? error.response?.data?.error;
}

function getErrorMessage(error: unknown) {
  if (isAxiosError<{ code?: string; error?: string; message?: string }>(error)) {
    return error.response?.data?.message
      ?? error.response?.data?.code
      ?? error.response?.data?.error
      ?? error.message;
  }
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}
