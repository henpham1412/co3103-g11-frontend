import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  Input,
  message,
  Row,
  Select,
  Tag,
  Typography,
} from "antd";
import {
  AppstoreOutlined,
  CalculatorOutlined,
  CodeOutlined,
  DatabaseOutlined,
  FormOutlined,
  LineChartOutlined,
  SearchOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";

import StudentWorkspaceLayout from "../../../components/layout/StudentWorkspaceLayout";
import { sampleClasses } from "../data/mockClasses";
import type { EnrollmentPolicy } from "../types";

import "../class-catalog.css";

const categoryOptions = [
  { value: "ALL", label: "All categories" },
  ...Array.from(new Set(sampleClasses.map((classItem) => classItem.category))).map(
    (category) => ({ value: category, label: category }),
  ),
];

const categoryVisuals: Record<string, { tone: string; icon: ReactNode }> = {
  Programming: { tone: "blue", icon: <CodeOutlined /> },
  "Information Systems": { tone: "blue", icon: <DatabaseOutlined /> },
  Communication: { tone: "purple", icon: <FormOutlined /> },
  Mathematics: { tone: "blue", icon: <CalculatorOutlined /> },
  "Web Development": { tone: "blue", icon: <AppstoreOutlined /> },
  "Data Science": { tone: "blue", icon: <LineChartOutlined /> },
};

export default function ClassCatalogPage() {
  const [searchText, setSearchText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [policy, setPolicy] = useState<EnrollmentPolicy | "ALL">("ALL");

  const visibleClasses = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();

    return sampleClasses.filter((classItem) => {
      const matchesSearch =
        !search ||
        [
          classItem.title,
          classItem.class_code,
          classItem.tutor.full_name,
        ].some((value) => value.toLowerCase().includes(search));

      const matchesPolicy =
        policy === "ALL" || classItem.enrollment_policy === policy;
      const matchesCategory =
        category === "ALL" || classItem.category === category;

      return (
        classItem.status === "ACTIVE" &&
        matchesSearch &&
        matchesPolicy &&
        matchesCategory
      );
    });
  }, [searchQuery, policy, category]);

  return (
    <StudentWorkspaceLayout currentPage="Class Catalog">
      <main className="class-catalog-page">
        <div className="class-catalog__heading">
          <Typography.Title level={2}>Class Catalog</Typography.Title>
          <Typography.Paragraph type="secondary">
            Explore October classes and find your next learning opportunity.
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
          />
        </div>

        <div>
          <Typography.Text className="class-catalog__filter-label">
            Category
          </Typography.Text>
          <Select
            size="large"
            value={category}
            onChange={setCategory}
            style={{ width: "100%" }}
            options={categoryOptions}
          />
        </div>

        <div>
          <Typography.Text className="class-catalog__filter-label">
            Enrollment Policy
          </Typography.Text>
          <Select
            size="large"
            value={policy}
            onChange={setPolicy}
            style={{ width: "100%" }}
            options={[
              { value: "ALL", label: "All policies" },
              { value: "OPEN", label: "Open" },
              {
                value: "APPROVAL_REQUIRED",
                label: "Approval required",
              },
            ]}
          />
        </div>

        <div className="class-catalog__filter-submit">
          <Button
            type="primary"
            size="large"
            block
            onClick={() => setSearchQuery(searchText)}
          >
            Search
          </Button>
        </div>
      </div>

        <div className="class-catalog__catalog-meta">
          <Typography.Text>
            {visibleClasses.length} classes available · October 2026
          </Typography.Text>
          <Typography.Text type="secondary">
            Prerequisites are guidance, not enrollment restrictions.
          </Typography.Text>
        </div>

      {visibleClasses.length === 0 ? (
        <Empty description="No classes match your filters" />
      ) : (
        <Row gutter={[20, 20]} className="class-catalog__cards">
        {visibleClasses.map((classItem) => {
          const isFull =
            classItem.max_capacity !== null &&
            classItem.active_member_count >= classItem.max_capacity;

          const actionLabel =
            classItem.membership === "ACTIVE"
              ? "Enrolled"
              : classItem.membership === "PENDING"
                ? "Request pending"
                : isFull
                  ? "Class full"
                  : classItem.enrollment_policy === "OPEN"
                    ? "Join Class"
                    : "Request to Join";

          const cannotJoin =
            classItem.membership !== "NONE" || isFull;
          const visual =
            categoryVisuals[classItem.category] ?? categoryVisuals.Programming;

          return (
            <Col
              key={classItem.class_id}
              xs={24}
              md={12}
              lg={8}
              className="class-catalog__card-column"
            >
              <Card className="class-catalog__card">
                <div
                  className={`class-catalog__card-cover class-catalog__card-cover--${visual.tone}`}
                >
                  <span className="class-catalog__subject-icon">
                    {visual.icon}
                  </span>
                  <span className="class-catalog__subject-name">
                    {classItem.category}
                  </span>
                  <span className="class-catalog__cover-lines" aria-hidden="true">
                    <i />
                    <i />
                  </span>
                </div>

                <div className="class-catalog__card-body">
                  <div className="class-catalog__card-meta">
                    <Typography.Text type="secondary">
                      {classItem.class_code}
                    </Typography.Text>
                    <Tag>
                      {classItem.max_capacity === null
                        ? `${classItem.active_member_count} students`
                        : `${classItem.active_member_count}/${classItem.max_capacity} Seats`}
                    </Tag>
                  </div>

                <Typography.Title level={4} className="class-catalog__course-title">
                  <Link to={`/classes/${classItem.class_id}`}>
                    {classItem.title}
                  </Link>
                </Typography.Title>

                  <div className="class-catalog__tutor">
                    <Avatar icon={<UserOutlined />} />
                    <Typography.Text>{classItem.tutor.full_name}</Typography.Text>
                  </div>

                <Typography.Text type="secondary">
                  PREREQUISITES · INFORMATION ONLY
                </Typography.Text>
                <br />
                <Typography.Text>
                  {classItem.prerequisites_description || "None"}
                </Typography.Text>

                  <div className="class-catalog__card-status">
                    <Tag
                      color={
                        classItem.enrollment_policy === "OPEN"
                          ? "green"
                          : "orange"
                      }
                    >
                      {classItem.enrollment_policy}
                    </Tag>
                    {classItem.membership === "ACTIVE" && (
                      <span className="class-catalog__enrolled-label">
                        Enrolled
                      </span>
                    )}
                  </div>

                  <Button
                    block
                    type={classItem.membership === "ACTIVE" ? "default" : "primary"}
                    disabled={cannotJoin}
                    onClick={() => {
                      message.info(
                        "This is sample data. Enrollment is not connected yet.",
                      );
                    }}
                  >
                    {actionLabel}
                  </Button>
                </div>
              </Card>
            </Col>
          );
        })}
        </Row>
      )}
      </main>
    </StudentWorkspaceLayout>
  );
}
