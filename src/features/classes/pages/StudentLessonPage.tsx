import { useEffect, useState } from "react";
import { Alert, App, Button, Card, Empty, Spin, Tag, Typography } from "antd";
import { ArrowLeftOutlined, ArrowRightOutlined, FileTextOutlined, LinkOutlined, VideoCameraOutlined } from "@ant-design/icons";
import { Link, useParams } from "react-router-dom";

import StudentWorkspaceLayout from "../../../components/layout/StudentWorkspaceLayout";
import { normalizeApiError } from "@/api/apiError";
import {
  getClassDetails,
  getClassOutline,
  downloadStudentMaterial,
  getStudentLesson,
  getStudentLessonMaterials,
} from "../api/classApi";
import type { ClassCatalogItem, ClassOutlineLesson, ClassOutlineMaterial, ClassOutlineResponse } from "../types";
import { getLessonNavigation, getMaterialDisplay } from "../student-lesson-model";
import "../student-lesson.css";

interface StudentLessonPageData {
  requestKey: string;
  classItem?: ClassCatalogItem;
  outline?: ClassOutlineResponse;
  lesson?: ClassOutlineLesson;
  materials?: ClassOutlineMaterial[];
  error?: string;
  status?: number;
}

export default function StudentLessonPage() {
  const { classId = "", lessonId = "" } = useParams();
  const requestKey = `${classId}:${lessonId}`;
  const [result, setResult] = useState<StudentLessonPageData>();
  const loading = result?.requestKey !== requestKey;
  const page = loading ? undefined : result;
  const navigation = getLessonNavigation(page?.outline, lessonId);

  useEffect(() => {
    if (!classId || !lessonId) return;
    const controller = new AbortController();
    Promise.all([
      getClassDetails(classId, controller.signal),
      getClassOutline(classId, controller.signal),
      getStudentLesson(lessonId, controller.signal),
      getStudentLessonMaterials(lessonId, controller.signal),
    ])
      .then(([classItem, outline, lesson, materials]) => {
        if (!controller.signal.aborted) {
          setResult({ requestKey, classItem, outline, lesson, materials });
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const failure = normalizeApiError(cause);
        setResult({ requestKey, error: failure.message, status: failure.status });
      });
    return () => controller.abort();
  }, [classId, lessonId, requestKey]);

  let content;
  if (loading) {
    content = <div className="student-lesson__loading" role="status" aria-live="polite"><Spin /><span>Loading lesson…</span></div>;
  } else if (page?.error) {
    content = page.status === 403 ? (
      <Alert type="warning" showIcon title="You do not have access to this lesson" description="Join the class or wait for tutor approval before opening its learning content." />
    ) : page.status === 404 ? (
      <Alert type="warning" showIcon title="Lesson is unavailable" description="It may have been hidden, removed, or is not part of this class." />
    ) : (
      <Alert type="error" showIcon title="Could not load this lesson" description={page.error} />
    );
  } else if (!page?.classItem || !page.lesson || !navigation.current) {
    content = (
      <Alert
        type="warning"
        showIcon
        title="This lesson is not in the published outline"
        description="A lesson stays hidden when it is unpublished itself, when its chapter is hidden, or when it belongs to another class."
      />
    );
  } else {
    content = (
      <>
        <div className="student-lesson__breadcrumb">
          <Link to={`/classes/${classId}`}><ArrowLeftOutlined /> {page.classItem.title}</Link>
          <span>/ {navigation.current.chapter_title}</span>
        </div>
        <div className="student-lesson__heading">
          <div>
            <Typography.Title level={2}>{page.lesson.title}</Typography.Title>
            <div className="student-lesson__meta">
              {page.lesson.estimated_duration != null && <Tag>{page.lesson.estimated_duration} mins</Tag>}
              {page.lesson.status && <Tag color={page.lesson.status === "PUBLISHED" ? "green" : "default"}>{page.lesson.status}</Tag>}
              <span>{page.classItem.tutor.full_name} · {page.classItem.class_code}</span>
            </div>
          </div>
          <span>Lesson {navigation.current.sequence_order + 1}</span>
        </div>

        <Card className="student-lesson__content-card">
          <Typography.Title level={4}>Lesson content</Typography.Title>
          {page.lesson.description ? (
            <div className="student-lesson__prose">{page.lesson.description}</div>
          ) : (
            <Typography.Text type="secondary">No lesson text has been provided.</Typography.Text>
          )}
        </Card>

        <section className="student-lesson__materials" aria-labelledby="lesson-materials-heading">
          <div className="student-lesson__section-title">
            <Typography.Title id="lesson-materials-heading" level={4}>Lesson materials</Typography.Title>
            <Typography.Text type="secondary">{page.materials?.length ?? 0} items</Typography.Text>
          </div>
          {!page.materials?.length ? <Empty description="No published materials for this lesson." /> : (
            <div className="student-lesson__material-list">
              {page.materials.map((material) => <MaterialCard key={material.material_id} material={material} />)}
            </div>
          )}
        </section>

        <section className="student-lesson__activities" aria-labelledby="lesson-activities-heading">
          <div className="student-lesson__section-title">
            <Typography.Title id="lesson-activities-heading" level={4}>Quizzes and assignments</Typography.Title>
          </div>
          {(navigation.current.activities ?? []).filter((activity) => activity.status !== "HIDDEN").length === 0 ? (
            <Empty description="No published quizzes or assignments for this lesson." />
          ) : (
            <div className="student-lesson__activity-list">
              {(navigation.current.activities ?? []).filter((activity) => activity.status !== "HIDDEN").map((activity) => (
                <Link key={activity.activity_id} to={`/classes/${classId}/lessons/${lessonId}/activities/${activity.activity_id}`}>
                  <Button type={activity.activity_type === "QUIZ" ? "primary" : "default"}>
                    {activity.activity_type === "QUIZ" ? "Take quiz" : "Open assignment"} · {activity.title}
                  </Button>
                </Link>
              ))}
            </div>
          )}
        </section>

        <Alert
          className="student-lesson__progress-note"
          type="info"
          showIcon
          title="Opening a lesson does not mark it complete."
          description="Learning progress updates are not exposed by the current LMS APIs."
        />

        <nav className="student-lesson__lesson-nav" aria-label="Lesson navigation">
          {navigation.previous ? (
            <Link to={`/classes/${classId}/lessons/${navigation.previous.lesson_id}`}>
              <Button icon={<ArrowLeftOutlined />}>Previous<span>{navigation.previous.title}</span></Button>
            </Link>
          ) : <span />}
          {navigation.next ? (
            <Link to={`/classes/${classId}/lessons/${navigation.next.lesson_id}`}>
              <Button type="primary">Next lesson<span>{navigation.next.title}</span><ArrowRightOutlined /></Button>
            </Link>
          ) : <Typography.Text type="secondary">End of published lessons</Typography.Text>}
        </nav>
      </>
    );
  }

  return (
    <StudentWorkspaceLayout currentPage="Class Catalog > Class Detail > Lesson">
      <main className="student-lesson-page">{content}</main>
    </StudentWorkspaceLayout>
  );
}

function MaterialCard({ material }: { material: ClassOutlineMaterial }) {
  const { message } = App.useApp();
  const [downloading, setDownloading] = useState(false);
  const display = getMaterialDisplay(material);
  const icon = material.material_type === "VIDEO" ? <VideoCameraOutlined />
    : material.material_type === "URL" ? <LinkOutlined /> : <FileTextOutlined />;

  return (
    <Card className="student-lesson__material-card" size="small">
      <span className="student-lesson__material-icon">{icon}</span>
      <div className="student-lesson__material-body">
        <Typography.Text strong>{material.title}</Typography.Text>
        {display === "text" && <div className="student-lesson__prose">{material.content}</div>}
        {display === "link" && <a href={material.file_url ?? undefined} target="_blank" rel="noreferrer">Open external resource</a>}
        {display === "file" && (
          <Button
            type="link"
            loading={downloading}
            onClick={async () => {
              setDownloading(true);
              try {
                const { blob, filename } = await downloadStudentMaterial(material.file_url!);
                const objectUrl = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = objectUrl;
                link.download = filename || material.title;
                document.body.append(link);
                link.click();
                link.remove();
                window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
              } catch (cause) {
                message.error(normalizeApiError(cause).message || "Could not download this material.");
              } finally {
                setDownloading(false);
              }
            }}
          >
            Download material
          </Button>
        )}
        {display === "unavailable" && <Typography.Text type="secondary">This material has no content or file to open.</Typography.Text>}
      </div>
      <Tag>{material.material_type}</Tag>
    </Card>
  );
}
