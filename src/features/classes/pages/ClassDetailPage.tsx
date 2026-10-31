import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Collapse,
  Descriptions,
  Empty,
  message,
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
  classId: string;
  data?: ClassCatalogItem;
  error?: string;
}

interface ClassOutlineResult {
  requestKey: string;
  data?: ClassOutlineResponse;
  error?: string;
  membershipRequired?: boolean;
}

export default function ClassDetailPage() {
  const { classId = "" } = useParams();
  const [detailResult, setDetailResult] = useState<ClassDetailResult | null>(null);
  const [outlineResult, setOutlineResult] = useState<ClassOutlineResult | null>(null);
  const [outlineVersion, setOutlineVersion] = useState(0);
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus | null>(null);
  const [joining, setJoining] = useState(false);

  const detailLoading = detailResult?.classId !== classId;
  const classItem = detailLoading ? undefined : detailResult?.data;
  const detailError = detailLoading ? undefined : detailResult?.error;
  const outlineRequestKey = `${classId}:${outlineVersion}`;
  const outlineLoading = Boolean(classItem) && outlineResult?.requestKey !== outlineRequestKey;
  const outline = outlineLoading ? undefined : outlineResult?.data;
  const outlineError = outlineLoading ? undefined : outlineResult?.error;
  const membershipRequired = !outlineLoading && outlineResult?.membershipRequired === true;

  useEffect(() => {
    if (!classId) return;
    const controller = new AbortController();

    getClassDetails(classId, controller.signal)
      .then((data) => setDetailResult({ classId, data }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDetailResult({ classId, error: getErrorMessage(error) });
        }
      });

    return () => controller.abort();
  }, [classId]);

  useEffect(() => {
    if (!classItem) return;
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
  }, [classId, classItem, outlineRequestKey]);

  useEffect(() => {
    if (!classId) return;
    const controller = new AbortController();

    getCurrentMemberships(controller.signal)
      .then((memberships) => {
        const membership = memberships.find((item) => item.class_id === classId);
        setMembershipStatus(membership?.status === "ACTIVE" || membership?.status === "PENDING"
          ? membership.status
          : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMembershipStatus(null);
      });

    return () => controller.abort();
  }, [classId]);

  async function handleJoin() {
    if (!classItem) return;
    setJoining(true);
    try {
      const result = await joinClass(classItem.class_id, classItem.enrollment_policy);
      setMembershipStatus(result.status);
      if (result.status === "ACTIVE") {
        message.success("You joined the class.");
        setOutlineVersion((version) => version + 1);
      } else {
        message.success("Your request to join was submitted.");
      }
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setJoining(false);
    }
  }

  async function handleMembershipEnd() {
    if (!classItem || !membershipStatus) return;
    setJoining(true);
    try {
      if (membershipStatus === "ACTIVE") {
        await leaveClass(classItem.class_id);
        message.success("You left the class.");
        setOutlineVersion((version) => version + 1);
      } else {
        await withdrawJoinRequest(classItem.class_id);
        message.success("Your join request was withdrawn.");
      }
      setMembershipStatus(null);
    } catch (error) {
      message.error(getErrorMessage(error));
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
      message="The syllabus is available to active class members."
      description={
        membershipStatus === "PENDING"
          ? "Your request is waiting for tutor approval."
          : "Join this class to view its published learning outline."
      }
      action={
        membershipStatus === "PENDING" ? (
          <Popconfirm
            title="Withdraw your join request?"
            okText="Withdraw request"
            cancelText="Keep"
            onConfirm={handleMembershipEnd}
          >
            <Button loading={joining}>Withdraw request</Button>
          </Popconfirm>
        ) : (
          <Button
            type="primary"
            loading={joining}
            disabled={classItem?.enrollment_policy === "OPEN"
              && classItem.max_capacity !== null
              && classItem.active_member_count >= classItem.max_capacity}
            onClick={handleJoin}
          >
            {classItem?.enrollment_policy === "OPEN" ? "Join Class" : "Request to Join"}
          </Button>
        )
      }
    />
  ) : outlineError ? (
    <Alert type="warning" showIcon message="The syllabus could not be loaded" description={outlineError} />
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
            chapter.lessons.map((lesson) => (
              <div className="class-detail__lesson" key={lesson.lesson_id}>
                <span className="class-detail__lesson-check"><CheckCircleOutlined /></span>
                <span>{lesson.title}</span>
                {lesson.estimated_duration != null && (
                  <Tag bordered={false}>{lesson.estimated_duration} mins</Tag>
                )}
              </div>
            ))
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
          <Alert type="error" showIcon message="Could not load this class" description={detailError ?? "Class not found."} />
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

            {membershipStatus === "ACTIVE" && (
              <div className="class-detail__membership-status">
                <Tag color="green">Enrolled</Tag>
                <Popconfirm
                  title="Leave this class?"
                  description="You will lose access to this class's learning content."
                  okText="Leave class"
                  cancelText="Keep"
                  onConfirm={handleMembershipEnd}
                >
                  <Button size="small" loading={joining}>Leave class</Button>
                </Popconfirm>
              </div>
            )}
            {membershipStatus === "PENDING" && (
              <div className="class-detail__membership-status">
                <Tag color="orange">Request pending</Tag>
              </div>
            )}

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
