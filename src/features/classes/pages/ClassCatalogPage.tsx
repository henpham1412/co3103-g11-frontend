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

type MembershipOperation = "join" | "leave" | "withdraw";

const operations: readonly MembershipOperation[] = ["join", "leave", "withdraw"];

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
  // Membership writes move the server-owned seat counts and can shrink the last page, so a
  // finished operation bumps this token and every read is re-issued under a new identity.
  const [readToken, setReadToken] = useState(0);
  const requestKey = [searchQuery, policy, page, sort, readToken].join("|");
  const membershipRequestKey = ["memberships", readToken].join("|");
  const [catalogResult, setCatalogResult] = useState<{
    key: string;
    data?: ClassCatalogResponse;
    error?: string;
  } | null>(null);
  const [membershipResult, setMembershipResult] = useState<{
    key: string;
    statuses?: Record<string, MembershipStatus>;
    error?: string;
  } | null>(null);
  // Keyed by class and operation, so finishing one request can neither re-enable another
  // card nor clear the pending indicator of an operation that is still running.
  const [pendingOperations, setPendingOperations] = useState<Record<string, true>>({});

  const membershipStatuses = membershipResult?.key === membershipRequestKey
    ? membershipResult.statuses
    : undefined;
  const membershipStatusAvailable = membershipStatuses !== undefined;
  const membershipStatusError = membershipResult?.key === membershipRequestKey
    ? membershipResult.error
    : undefined;

  const loading = catalogResult?.key !== requestKey;
  const catalog = loading ? null : catalogResult?.data ?? null;
  const error = loading ? null : catalogResult?.error ?? null;
  const totalItems = catalog?.total_items ?? 0;

  function operationKey(classId: string, operation: MembershipOperation) {
    return `${classId}:${operation}`;
  }

  function beginOperation(classId: string, operation: MembershipOperation) {
    setPendingOperations((current) => ({ ...current, [operationKey(classId, operation)]: true }));
  }

  function endOperation(classId: string, operation: MembershipOperation) {
    setPendingOperations((current) => {
      const remaining = { ...current };
      delete remaining[operationKey(classId, operation)];
      return remaining;
    });
  }

  function isOperationPending(classId: string, operation: MembershipOperation) {
    return pendingOperations[operationKey(classId, operation)] === true;
  }

  function hasPendingOperation(classId: string) {
    return operations.some((operation) => isOperationPending(classId, operation));
  }

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
      .then((data) => {
        setCatalogResult({ key: requestKey, data });
        // A page can fall out of range while it is displayed, for example when classes are
        // archived and the filtered total shrinks. Those classes still exist on an earlier page,
        // so the page is corrected rather than presented as a zero-result search.
        if (controller.signal.aborted) return;
        const lastPage = Math.max(data.total_pages, 1);
        if (page > lastPage && data.items.length === 0 && data.total_items > 0) {
          setPage(lastPage);
        }
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setCatalogResult({ key: requestKey, error: getErrorMessage(requestError) });
        }
      });

    return () => controller.abort();
  }, [requestKey, searchQuery, policy, page, sort]);

  useEffect(() => {
    const controller = new AbortController();

    getCurrentMemberships(controller.signal)
      .then((memberships) => {
        setMembershipResult({
          key: membershipRequestKey,
          statuses: Object.fromEntries(
            memberships.map(({ class_id, status }) => [class_id, status]),
          ),
        });
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setMembershipResult({ key: membershipRequestKey, error: getErrorMessage(requestError) });
        }
      });

    return () => controller.abort();
  }, [membershipRequestKey]);

  function submitSearch() {
    setPage(1);
    setSearchQuery(searchText.trim());
  }

  async function handleJoin(classItem: ClassCatalogItem) {
    const { class_id: classId } = classItem;
    if (hasPendingOperation(classId)) return;
    beginOperation(classId, "join");
    try {
      const membership = await joinClass(classId, classItem.enrollment_policy);
      message.success(
        membership.status === "PENDING"
          ? "Your request to join was submitted."
          : "You joined the class.",
      );
      setReadToken((token) => token + 1);
    } catch (requestError) {
      const code = isAxiosError<{ code?: string }>(requestError)
        ? requestError.response?.data?.code
        : undefined;
      if (code === "CLASS_FULL" || code === "INVALID_MEMBERSHIP_STATE") {
        // Either code means the server state differs from this page, so it is re-read.
        if (code === "CLASS_FULL") {
          message.error("This class is full.");
        } else {
          message.warning("Your membership already exists. Refreshing its current status.");
        }
        setReadToken((token) => token + 1);
      } else {
        message.error(getErrorMessage(requestError));
      }
    } finally {
      endOperation(classId, "join");
    }
  }

  async function handleMembershipEnd(
    classItem: ClassCatalogItem,
    status: "ACTIVE" | "PENDING",
  ) {
    const { class_id: classId } = classItem;
    const operation: MembershipOperation = status === "ACTIVE" ? "leave" : "withdraw";
    if (hasPendingOperation(classId)) return;
    beginOperation(classId, operation);
    try {
      if (status === "ACTIVE") {
        await leaveClass(classId);
        message.success("You left the class.");
      } else {
        await withdrawJoinRequest(classId);
        message.success("Your join request was withdrawn.");
      }
      setReadToken((token) => token + 1);
    } catch (requestError) {
      message.error(getErrorMessage(requestError));
    } finally {
      endOperation(classId, operation);
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
            {totalItems} classes available
          </Typography.Text>
          <Typography.Text type="secondary">
            Prerequisites are guidance, not enrollment restrictions.
          </Typography.Text>
        </div>

        {error && (
          <Alert
            type="error"
            showIcon
            title="Could not load the class catalog"
            description={error}
            className="class-catalog__error"
          />
        )}

        {membershipStatusError && (
          <Alert
            type="warning"
            showIcon
            title="Membership status is unavailable"
            description="You can browse classes, but join and leave actions are disabled until your membership status can be loaded."
            className="class-catalog__error"
          />
        )}

        {loading ? (
          <div className="class-catalog__loading" role="status" aria-live="polite">
            <Spin />
            <span>Loading classes…</span>
          </div>
        ) : (
          <>
            {classes.length === 0 ? (
              <Empty
                description={
                  error
                    ? "Catalog is unavailable"
                    : totalItems > 0
                      ? "This page has no classes. Use the pagination below to return to a page that does."
                      : "No classes match your search"
                }
              />
            ) : (
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
                      membershipStatus={membershipStatuses?.[classItem.class_id]}
                      membershipStatusAvailable={membershipStatusAvailable}
                      membershipStatusFailed={membershipStatusError !== undefined}
                      joinPending={isOperationPending(classItem.class_id, "join")}
                      endPending={
                        isOperationPending(classItem.class_id, "leave")
                        || isOperationPending(classItem.class_id, "withdraw")
                      }
                      busy={hasPendingOperation(classItem.class_id)}
                      onJoin={() => handleJoin(classItem)}
                      onMembershipEnd={(status) => handleMembershipEnd(classItem, status)}
                    />
                  </Col>
                ))}
              </Row>
            )}
            {totalItems > 0 && (
              <Pagination
                className="class-catalog__pagination"
                current={catalog?.page ?? page}
                pageSize={catalog?.size ?? PAGE_SIZE}
                total={totalItems}
                showSizeChanger={false}
                onChange={setPage}
              />
            )}
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
  joinPending,
  endPending,
  busy,
  onJoin,
  onMembershipEnd,
}: {
  classItem: ClassCatalogItem;
  membershipStatus?: MembershipStatus;
  membershipStatusAvailable: boolean;
  membershipStatusFailed: boolean;
  joinPending: boolean;
  endPending: boolean;
  busy: boolean;
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
  const coverUrl = classItem.thumbnail_url?.trim() || null;
  const [failedCoverUrl, setFailedCoverUrl] = useState<string | null>(null);
  const showCover = coverUrl !== null && failedCoverUrl !== coverUrl;

  return (
    <Card className="class-catalog__card">
      <div className={`class-catalog__card-cover class-catalog__card-cover--blue${showCover ? " class-catalog__card-cover--thumbnail" : ""}`}>
        {showCover ? (
          <img
            className="class-catalog__card-cover-image"
            src={coverUrl}
            alt={`${classItem.title} cover`}
            onError={() => setFailedCoverUrl(coverUrl)}
          />
        ) : (
          <span className="class-catalog__cover-lines" aria-hidden="true">
            <i />
            <i />
          </span>
        )}
        <span className="class-catalog__subject-icon" aria-hidden="true">
          <BookOutlined />
        </span>
        <span className="class-catalog__subject-name">CLASS</span>
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
            okText={isEnrolled ? "Leave" : "Withdraw"}
            cancelText="Keep"
            disabled={busy}
            onConfirm={() => onMembershipEnd(isEnrolled ? "ACTIVE" : "PENDING")}
          >
            <Button block loading={endPending} disabled={busy}>
              {isEnrolled ? "Leave class" : "Withdraw request"}
            </Button>
          </Popconfirm>
        ) : (
          <Button
            block
            type="primary"
            disabled={!membershipStatusAvailable || (isFull && !canRequest) || busy}
            loading={joinPending}
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
