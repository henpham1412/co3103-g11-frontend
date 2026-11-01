import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  Input,
  message,
  Pagination,
  Popconfirm,
  Row,
  Select,
  Spin,
  Tag,
  Typography,
} from "antd";
import { BookOutlined, SearchOutlined, UserOutlined } from "@ant-design/icons";
import { isAxiosError } from "axios";
import { Link } from "react-router-dom";

import StudentWorkspaceLayout from "../../../components/layout/StudentWorkspaceLayout";
import {
  getClassCatalog,
  getCurrentMemberships,
  leaveClass,
  joinClass,
  withdrawJoinRequest,
} from "../api/classApi";
import type {
  ClassCatalogItem,
  ClassCatalogResponse,
  EnrollmentPolicy,
  MembershipStatus,
} from "../types";

import "../class-catalog.css";

const PAGE_SIZE = 12;
const DEFAULT_SORT = "created_at,desc";

const sortOptions = [
  { value: "created_at,desc", label: "Newest first" },
  { value: "created_at,asc", label: "Oldest first" },
  { value: "title,asc", label: "Title ascending" },
  { value: "title,desc", label: "Title descending" },
];

export default function ClassCatalogPage() {
  const [searchText, setSearchText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [policy, setPolicy] = useState<EnrollmentPolicy | "ALL">("ALL");
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const requestKey = `${searchQuery}\u0000${policy}\u0000${page}\u0000${sort}`;
  const [catalogResult, setCatalogResult] = useState<{
    key: string;
    data?: ClassCatalogResponse;
    error?: string;
  } | null>(null);
  const [membershipByClass, setMembershipByClass] = useState<
    Record<string, MembershipStatus>
  >({});
  const [membershipStatusAvailable, setMembershipStatusAvailable] = useState(false);
  const [membershipStatusError, setMembershipStatusError] = useState<string | null>(null);
  const [joiningClassId, setJoiningClassId] = useState<string | null>(null);

  const loading = catalogResult?.key !== requestKey;
  const catalog = loading ? null : catalogResult?.data ?? null;
  const error = loading ? null : catalogResult?.error ?? null;

  useEffect(() => {
    const controller = new AbortController();

    getClassCatalog(
      {
        q: searchQuery || undefined,
        enrollment_policy: policy === "ALL" ? undefined : policy,
        page,
        size: PAGE_SIZE,
        sort,
      },
      controller.signal,
    )
      .then((data) => setCatalogResult({ key: requestKey, data }))
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setCatalogResult({
            key: requestKey,
            error: getErrorMessage(requestError),
          });
        }
      });

    return () => controller.abort();
  }, [requestKey, searchQuery, policy, page, sort]);

  useEffect(() => {
    const controller = new AbortController();

    getCurrentMemberships(controller.signal)
      .then((memberships) => {
        setMembershipByClass(Object.fromEntries(
          memberships.map(({ class_id, status }) => [class_id, status]),
        ));
        setMembershipStatusAvailable(true);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setMembershipStatusError(getErrorMessage(requestError));
        }
      });

    return () => controller.abort();
  }, []);

  function submitSearch() {
    setPage(1);
    setSearchQuery(searchText.trim());
  }

  async function handleJoin(classItem: ClassCatalogItem) {
    setJoiningClassId(classItem.class_id);
    try {
      const membership = await joinClass(classItem.class_id, classItem.enrollment_policy);
      setMembershipByClass((current) => ({
        ...current,
        [classItem.class_id]: membership.status,
      }));
      message.success(
        membership.status === "PENDING"
          ? "Your request to join was submitted."
          : "You joined the class.",
      );
    } catch (requestError) {
      const code = isAxiosError<{ code?: string }>(requestError)
        ? requestError.response?.data?.code
        : undefined;
      if (code === "CLASS_FULL") {
        message.error("This class is full.");
      } else if (code === "INVALID_MEMBERSHIP_STATE") {
        message.warning("Your membership already exists. Refresh the page to see its current status.");
      } else {
        message.error(getErrorMessage(requestError));
      }
    } finally {
      setJoiningClassId(null);
    }
  }

  async function handleMembershipEnd(classId: string, status: "ACTIVE" | "PENDING") {
    setJoiningClassId(classId);
    try {
      if (status === "ACTIVE") {
        await leaveClass(classId);
        message.success("You left the class.");
      } else {
        await withdrawJoinRequest(classId);
        message.success("Your join request was withdrawn.");
      }
      setMembershipByClass((current) => {
        const updated = { ...current };
        delete updated[classId];
        return updated;
      });
    } catch (requestError) {
      message.error(getErrorMessage(requestError));
    } finally {
      setJoiningClassId(null);
    }
  }

  const classes = catalog?.items ?? [];

  return (
    <StudentWorkspaceLayout currentPage="Class Catalog">
      <main className="class-catalog-page">
        <div className="class-catalog__heading">
          <Typography.Title level={2}>Class Catalog</Typography.Title>
          <Typography.Paragraph type="secondary">
            Explore classes and find your next learning opportunity.
          </Typography.Paragraph>
        </div>

        <div className="class-catalog__filters">
          <div className="class-catalog__filter-search">
            <Typography.Text className="class-catalog__filter-label">
              Search
            </Typography.Text>
            <Input
              size="large"
              allowClear
              prefix={<SearchOutlined style={{ color: "#60738f" }} />}
              placeholder="Search by class name, code or tutor"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onPressEnter={submitSearch}
            />
          </div>

          <div>
            <Typography.Text className="class-catalog__filter-label">
              Enrollment Policy
            </Typography.Text>
            <Select
              size="large"
              value={policy}
              onChange={(value: EnrollmentPolicy | "ALL") => {
                setPolicy(value);
                setPage(1);
              }}
              style={{ width: "100%" }}
              options={[
                { value: "ALL", label: "All policies" },
                { value: "OPEN", label: "Open" },
                { value: "APPROVAL_REQUIRED", label: "Approval required" },
              ]}
            />
          </div>

          <div>
            <Typography.Text className="class-catalog__filter-label">
              Sort by
            </Typography.Text>
            <Select
              size="large"
              value={sort}
              onChange={(value: string) => {
                setSort(value);
                setPage(1);
              }}
              style={{ width: "100%" }}
              options={sortOptions}
            />
          </div>

          <div className="class-catalog__filter-submit">
            <Button type="primary" size="large" block onClick={submitSearch}>
              Search
            </Button>
          </div>
        </div>

        <div className="class-catalog__catalog-meta">
          <Typography.Text>
            {catalog?.total_items ?? 0} classes available
          </Typography.Text>
          <Typography.Text type="secondary">
            Prerequisites are guidance, not enrollment restrictions.
          </Typography.Text>
        </div>

        {error && (
          <Alert
            type="error"
            showIcon
            message="Could not load the class catalog"
            description={error}
            className="class-catalog__error"
          />
        )}

        {membershipStatusError && (
          <Alert
            type="warning"
            showIcon
            message="Membership status is unavailable"
            description="You can browse classes, but join and leave actions are disabled until your membership status can be loaded."
            className="class-catalog__error"
          />
        )}

        {loading ? (
          <div className="class-catalog__loading" role="status" aria-live="polite">
            <Spin />
            <span>Loading classes…</span>
          </div>
        ) : classes.length === 0 ? (
          <Empty description={error ? "Catalog is unavailable" : "No classes match your search"} />
        ) : (
          <>
            <Row gutter={[20, 20]} className="class-catalog__cards">
              {classes.map((classItem) => (
                <Col
                  key={classItem.class_id}
                  xs={24}
                  md={12}
                  lg={8}
                  className="class-catalog__card-column"
                >
                  <ClassCard
                    classItem={classItem}
                    membershipStatus={membershipByClass[classItem.class_id]}
                    membershipStatusAvailable={membershipStatusAvailable}
                    membershipStatusFailed={membershipStatusError !== null}
                    joining={joiningClassId === classItem.class_id}
                    onJoin={() => handleJoin(classItem)}
                    onMembershipEnd={(status) =>
                      handleMembershipEnd(classItem.class_id, status)
                    }
                  />
                </Col>
              ))}
            </Row>
            <Pagination
              className="class-catalog__pagination"
              current={catalog?.page ?? page}
              pageSize={catalog?.size ?? PAGE_SIZE}
              total={catalog?.total_items ?? 0}
              showSizeChanger={false}
              onChange={setPage}
            />
          </>
        )}
      </main>
    </StudentWorkspaceLayout>
  );
}

function ClassCard({
  classItem,
  membershipStatus,
  membershipStatusAvailable,
  membershipStatusFailed,
  joining,
  onJoin,
  onMembershipEnd,
}: {
  classItem: ClassCatalogItem;
  membershipStatus?: MembershipStatus;
  membershipStatusAvailable: boolean;
  membershipStatusFailed: boolean;
  joining: boolean;
  onJoin: () => void;
  onMembershipEnd: (status: "ACTIVE" | "PENDING") => void;
}) {
  const isFull =
    classItem.max_capacity !== null &&
    classItem.active_member_count >= classItem.max_capacity;
  const isPending = membershipStatus === "PENDING";
  const isEnrolled = membershipStatus === "ACTIVE";
  const canRequest = classItem.enrollment_policy === "APPROVAL_REQUIRED";
  const actionLabel = isEnrolled
    ? "Enrolled"
    : isPending
      ? "Request pending"
      : isFull && !canRequest
        ? "Class full"
        : canRequest
          ? "Request to Join"
          : "Join Class";
  const displayedActionLabel = membershipStatusAvailable
    ? actionLabel
    : membershipStatusFailed
      ? "Membership unavailable"
      : "Checking membership…";

  return (
    <Card className="class-catalog__card">
      <div className="class-catalog__card-cover class-catalog__card-cover--blue">
        <span className="class-catalog__subject-icon" aria-hidden="true">
          <BookOutlined />
        </span>
        <span className="class-catalog__subject-name">CLASS</span>
        <span className="class-catalog__cover-lines" aria-hidden="true">
          <i />
          <i />
        </span>
      </div>

      <div className="class-catalog__card-body">
        <div className="class-catalog__card-meta">
          <Typography.Text type="secondary">{classItem.class_code}</Typography.Text>
          <Tag>
            {classItem.max_capacity === null
              ? `${classItem.active_member_count} students`
              : `${classItem.active_member_count}/${classItem.max_capacity} Seats`}
          </Tag>
        </div>

        <Typography.Title level={4} className="class-catalog__course-title">
          <Link to={`/classes/${classItem.class_id}`}>{classItem.title}</Link>
        </Typography.Title>

        <div className="class-catalog__tutor">
          <Avatar icon={<UserOutlined />} />
          <Typography.Text>{classItem.tutor.full_name}</Typography.Text>
        </div>

        <div className="class-catalog__prerequisites">
          <Typography.Text type="secondary">PREREQUISITES · INFORMATION ONLY</Typography.Text>
          <Typography.Text>{classItem.prerequisites_description || "None"}</Typography.Text>
        </div>

        <div className="class-catalog__card-status">
          <Tag color={canRequestPolicy(classItem.enrollment_policy) ? "orange" : "green"}>
            {classItem.enrollment_policy}
          </Tag>
          {isEnrolled && <span className="class-catalog__enrolled-label">Enrolled</span>}
          {isPending && <span className="class-catalog__pending-label">Pending</span>}
        </div>

        {isEnrolled || isPending ? (
          <Popconfirm
            title={isEnrolled ? "Leave this class?" : "Withdraw your join request?"}
            description={
              isEnrolled
                ? "You will lose access to this class's learning content."
                : "You can submit a new request later."
            }
            okText={isEnrolled ? "Leave class" : "Withdraw request"}
            cancelText="Keep"
            onConfirm={() => onMembershipEnd(isEnrolled ? "ACTIVE" : "PENDING")}
          >
            <Button block loading={joining}>
              {isEnrolled ? "Leave class" : "Withdraw request"}
            </Button>
          </Popconfirm>
        ) : (
          <Button
            block
            type="primary"
            disabled={!membershipStatusAvailable || (isFull && !canRequest)}
            loading={joining}
            onClick={onJoin}
          >
            {displayedActionLabel}
          </Button>
        )}
      </div>
    </Card>
  );
}

function canRequestPolicy(policy: EnrollmentPolicy) {
  return policy === "APPROVAL_REQUIRED";
}

function getErrorMessage(error: unknown) {
  if (isAxiosError<{ code?: string; message?: string }>(error)) {
    return error.response?.data?.message || error.response?.data?.code || error.message;
  }
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}
