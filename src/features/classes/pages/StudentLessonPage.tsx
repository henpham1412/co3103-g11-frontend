import { useEffect, useState } from "react";
import { Alert, Button, Card, Empty, Spin, Tag, Typography, message } from "antd";
import { ArrowLeftOutlined, ArrowRightOutlined, FileTextOutlined, LinkOutlined, VideoCameraOutlined } from "@ant-design/icons";
import { isAxiosError } from "axios";
import { Link, useParams } from "react-router-dom";

import StudentWorkspaceLayout from "../../../components/layout/StudentWorkspaceLayout";
import {
  getClassDetails,
  getClassOutline,
  downloadStudentMaterial,
  getStudentLesson,
  getStudentLessonMaterials,
} from "../api/classApi";
import type { ClassCatalogItem, ClassOutlineLesson, ClassOutlineMaterial, ClassOutlineResponse } from "../types";
import { getLessonNavigation, getMaterialDisplay } from "../student-lesson-model.mjs";
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
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({ requestKey, error: errorMessage(error), status: errorStatus(error) });
        }
      });
    return () => controller.abort();
  }, [classId, lessonId, requestKey]);

  let content;
  if (loading) {
    content = <div className="student-lesson__loading" role="status" aria-live="polite"><Spin /><span>Loading lesson…</span></div>;
  } else if (page?.error) {
    content = page.status === 403 ? (
      <Alert type="warning" showIcon message="You do not have access to this lesson" description="Join the class or wait for tutor approval before opening its learning content." />
    ) : page.status === 404 ? (
      <Alert type="warning" showIcon message="Lesson is unavailable" description="It may have been hidden, removed, or is not part of this class." />
    ) : (
      <Alert type="error" showIcon message="Could not load this lesson" description={page.error} />
    );
  } else if (!page?.classItem || !page.lesson || !navigation.current) {
    content = <Empty description="This lesson is not in the published class outline." />;
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
              <Tag color="blue">Published</Tag>
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

        <Alert
          className="student-lesson__progress-note"
          type="info"
          showIcon
          message="Opening a lesson does not mark it complete."
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
        {display === "file-unavailable" && (material.file_url ? (
          <Button
            type="link"
            disabled={import.meta.env.VITE_DEMO_MODE === "true"}
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
              } catch (error) {
                message.error(error instanceof Error ? error.message : "Could not download this material.");
              } finally {
                setDownloading(false);
              }
            }}
          >
            Download material
          </Button>
        ) : <Typography.Text type="secondary">No file is available for this material.</Typography.Text>)}
        {display === "invalid" && <Typography.Text type="secondary">This material has no supported content.</Typography.Text>}
      </div>
      <Tag>{material.material_type}</Tag>
    </Card>
  );
}

function errorStatus(error: unknown) {
  return isAxiosError(error) ? error.response?.status : undefined;
}

function errorMessage(error: unknown) {
  if (isAxiosError<{ message?: string; error?: string }>(error)) {
    return error.response?.data?.message ?? error.response?.data?.error ?? error.message;
  }
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}
