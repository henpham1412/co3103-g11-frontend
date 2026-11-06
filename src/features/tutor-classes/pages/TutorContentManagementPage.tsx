import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Button, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select,
  Spin, Switch, Tabs, Tag, Tooltip, Typography, message,
} from "antd";
import {
  ArrowLeftOutlined, BookOutlined, DeleteOutlined, EditOutlined, FileTextOutlined,
  LinkOutlined, PlusOutlined, UpOutlined, DownOutlined, VideoCameraOutlined,
} from "@ant-design/icons";
import { Link, useParams } from "react-router-dom";
import TutorWorkspaceLayout from "../../../components/layout/TutorWorkspaceLayout";
import { getClassDetails } from "../../classes/api/classApi";
import type { ClassCatalogItem } from "../../classes/types";
import {
  createChapter, createLesson, createMaterial, deleteChapter, deleteLesson,
  deleteMaterial, getTutorOutline, reorderChapters, reorderLessons, updateChapter,
  updateLesson, updateMaterial,
} from "../api/tutorClassApi";
import type { ContentVisibility, MaterialKind, TutorChapter, TutorLesson, TutorOutline } from "../types";

type Editor = { kind: "chapter"; item?: TutorChapter } | { kind: "lesson"; chapter: TutorChapter; item?: TutorLesson } | { kind: "material"; lesson: TutorLesson; item?: TutorLesson["materials"][number] };

export default function TutorContentManagementPage() {
  const { classId = "" } = useParams();
  const [classDetails, setClassDetails] = useState<ClassCatalogItem>();
  const [outline, setOutline] = useState<TutorOutline>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [editor, setEditor] = useState<Editor>();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [reload, setReload] = useState(0);

  const refresh = useCallback(() => { setLoading(true); setReload((value) => value + 1); }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getClassDetails(classId, controller.signal),
      getTutorOutline(classId, controller.signal),
    ])
      .then(([details, result]) => { setClassDetails(details); setOutline(result); setError(undefined); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [classId, reload]);

  const totals = useMemo(() => ({
    chapters: outline?.chapters.length ?? 0,
    lessons: outline?.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0) ?? 0,
    materials: outline?.chapters.reduce((sum, chapter) => sum + chapter.lessons.reduce((count, lesson) => count + lesson.materials.length, 0), 0) ?? 0,
  }), [outline]);

  function openEditor(next: Editor) {
    form.resetFields();
    if (next.kind === "chapter") {
      form.setFieldsValue(next.item ? {
        title: next.item.title, description: next.item.description,
        sequence_order: next.item.sequence_order, status: next.item.status,
      } : { sequence_order: outline?.chapters.length ?? 0, status: "PUBLISHED" });
    } else if (next.kind === "lesson") {
      form.setFieldsValue(next.item ? {
        title: next.item.title, description: next.item.description,
        estimated_duration: next.item.estimated_duration,
        sequence_order: next.item.sequence_order, status: next.item.status,
      } : { sequence_order: next.chapter.lessons.length, estimated_duration: 30, status: "PUBLISHED" });
    } else {
      form.setFieldsValue(next.item ? {
        title: next.item.title, sequence_order: next.item.sequence_order,
        status: next.item.status, material_type: next.item.material_type,
        content: next.item.content, file_url: next.item.file_url,
      } : { sequence_order: next.lesson.materials.length, status: "PUBLISHED", material_type: "TEXT" });
    }
    setEditor(next);
  }

  async function saveEditor() {
    if (!editor) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editor.kind === "chapter") {
        if (editor.item) await updateChapter(editor.item.chapter_id, values);
        else await createChapter(classId, values);
      }
      if (editor.kind === "lesson") {
        if (editor.item) await updateLesson(editor.item.lesson_id, values);
        else await createLesson(editor.chapter.chapter_id, values);
      }
      if (editor.kind === "material") {
        if (editor.item) {
          const patch = {
            title: values.title,
            sequence_order: values.sequence_order,
            status: values.status,
            ...(editor.item.material_type === "TEXT" ? { content: values.content } : {}),
            ...(editor.item.material_type === "URL" ? { file_url: values.file_url } : {}),
          };
          await updateMaterial(editor.item.material_id, patch);
        } else await createMaterial(editor.lesson.lesson_id, values);
      }
      message.success(`${editor.item ? "Changes saved for" : "Added"} ${editor.kind === "chapter" ? "chapter" : editor.kind === "lesson" ? "lesson" : "material"}.`);
      setEditor(undefined);
      refresh();
    } catch (cause) { message.error(errorText(cause)); }
    finally { setSaving(false); }
  }

  async function toggleVisibility(kind: "chapter" | "lesson" | "material", id: string, published: boolean) {
    const status: ContentVisibility = published ? "PUBLISHED" : "HIDDEN";
    try {
      if (kind === "chapter") await updateChapter(id, { status });
      if (kind === "lesson") await updateLesson(id, { status });
      if (kind === "material") await updateMaterial(id, { status });
      refresh();
    } catch (cause) { message.error(errorText(cause)); }
  }

  async function remove(kind: "chapter" | "lesson" | "material", id: string) {
    try {
      if (kind === "chapter") await deleteChapter(id);
      if (kind === "lesson") await deleteLesson(id);
      if (kind === "material") await deleteMaterial(id);
      message.success(`${kind[0].toUpperCase()}${kind.slice(1)} deleted.`);
      refresh();
    } catch (cause) { message.error(errorText(cause)); }
  }

  async function moveChapter(index: number, offset: -1 | 1) {
    if (!outline) return;
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= outline.chapters.length) return;
    const items = [...outline.chapters];
    [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
    try { await reorderChapters(classId, items.map((item) => item.chapter_id)); refresh(); }
    catch (cause) { message.error(errorText(cause)); }
  }

  async function moveLesson(chapter: TutorChapter, index: number, offset: -1 | 1) {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= chapter.lessons.length) return;
    const items = [...chapter.lessons];
    [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
    try { await reorderLessons(chapter.chapter_id, items.map((item) => item.lesson_id)); refresh(); }
    catch (cause) { message.error(errorText(cause)); }
  }

  return (
    <TutorWorkspaceLayout currentPage="Content Management">
      <main className="tutor-page tutor-content-page">
        <Link className="tutor-page__back" to={`/tutor/classes/${classId}`}><ArrowLeftOutlined /> Back to Class Detail</Link>
        <div className="tutor-page__heading">
          <div><Typography.Title level={2}>Content Management</Typography.Title><Typography.Paragraph type="secondary">Organize chapters, lessons and materials for your classes.</Typography.Paragraph></div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor({ kind: "chapter" })}>Add Chapter</Button>
        </div>
        {error && <Alert type="error" showIcon message="Could not load class content" description={error} />}
        {loading ? <div className="tutor-page__loading"><Spin /></div> : outline && classDetails ? <>
          <section className="tutor-content-classbar">
            <div className="tutor-content-classbar__icon"><BookOutlined /></div>
            <div><span>Editing curriculum for</span><strong>{classDetails.title}</strong></div>
            <Tag>{classDetails.class_code}</Tag>
            <Link to={`/tutor/classes/${classId}`}><Button>Open class</Button></Link>
          </section>
          <div className="tutor-content-summary"><div><strong>Curriculum</strong><span>{totals.chapters} chapters · {totals.lessons} lessons · {totals.materials} materials</span></div><span className="tutor-content-summary__saved">✓ All changes saved</span></div>
          <Alert className="tutor-content-tip" type="info" showIcon message="New content is published by default. Hidden parents make all nested content inaccessible to students." />
          {outline.chapters.length === 0 ? <Empty description="No chapters yet. Add a chapter to start the curriculum." /> : (
            <div className="tutor-chapter-list">
              {outline.chapters.map((chapter, chapterIndex) => (
                <section className="tutor-chapter-card" key={chapter.chapter_id}>
                  <header className="tutor-chapter-card__header">
                    <span className="tutor-reorder-buttons"><Button aria-label="Move chapter up" size="small" type="text" icon={<UpOutlined />} disabled={chapterIndex === 0} onClick={() => moveChapter(chapterIndex, -1)} /><Button aria-label="Move chapter down" size="small" type="text" icon={<DownOutlined />} disabled={chapterIndex === outline.chapters.length - 1} onClick={() => moveChapter(chapterIndex, 1)} /></span>
                    <div className="tutor-chapter-card__title"><strong>Chapter {chapterIndex + 1} · {chapter.title}</strong><span>{chapter.lessons.length} lessons · {chapter.lessons.reduce((sum, lesson) => sum + lesson.materials.length, 0)} materials</span></div>
                    <div className="tutor-content-actions"><VisibilitySwitch status={chapter.status} onChange={(value) => toggleVisibility("chapter", chapter.chapter_id, value)} /><Button icon={<PlusOutlined />} onClick={() => openEditor({ kind: "lesson", chapter })}>Add Lesson</Button><Button type="text" icon={<EditOutlined />} aria-label={`Edit ${chapter.title}`} onClick={() => openEditor({ kind: "chapter", item: chapter })} /><Tooltip title="Delete chapter"><Popconfirm title="Delete this chapter and its contents?" description="The backend will keep it if learning records depend on it." onConfirm={() => remove("chapter", chapter.chapter_id)}><Button type="text" danger icon={<DeleteOutlined />} /></Popconfirm></Tooltip></div>
                  </header>
                  {chapter.lessons.length > 0 && <div className="tutor-lesson-list">
                    {chapter.lessons.map((lesson, lessonIndex) => (
                      <article className="tutor-lesson-card" key={lesson.lesson_id}>
                        <header className="tutor-lesson-card__header">
                          <span className="tutor-reorder-buttons"><Button aria-label="Move lesson up" size="small" type="text" icon={<UpOutlined />} disabled={lessonIndex === 0} onClick={() => moveLesson(chapter, lessonIndex, -1)} /><Button aria-label="Move lesson down" size="small" type="text" icon={<DownOutlined />} disabled={lessonIndex === chapter.lessons.length - 1} onClick={() => moveLesson(chapter, lessonIndex, 1)} /></span>
                          <div className="tutor-chapter-card__title"><strong>{chapterIndex + 1}.{lessonIndex + 1} · {lesson.title}</strong><span>{lesson.estimated_duration ?? "—"} mins{lesson.status === "HIDDEN" ? " · Hidden from students" : ""}</span></div>
                          <div className="tutor-content-actions"><VisibilitySwitch status={lesson.status} onChange={(value) => toggleVisibility("lesson", lesson.lesson_id, value)} /><Button size="small" type="text" icon={<EditOutlined />} aria-label={`Edit ${lesson.title}`} onClick={() => openEditor({ kind: "lesson", chapter, item: lesson })} /><Popconfirm title="Delete this lesson?" onConfirm={() => remove("lesson", lesson.lesson_id)}><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Popconfirm></div>
                        </header>
                        {lesson.materials.map((material) => <div className="tutor-material-row" key={material.material_id}>
                          <div className="tutor-material-row__icon">{material.material_type === "URL" ? <LinkOutlined /> : material.material_type === "VIDEO" ? <VideoCameraOutlined /> : <FileTextOutlined />}</div>
                          <div className="tutor-material-row__title"><strong>{material.title}</strong><span>{material.material_type === "TEXT" ? "Rich Text" : material.material_type}</span></div>
                          <VisibilitySwitch status={material.status} onChange={(value) => toggleVisibility("material", material.material_id, value)} />
                          <Button type="text" icon={<EditOutlined />} aria-label={`Edit ${material.title}`} onClick={() => openEditor({ kind: "material", lesson, item: material })} />
                          <Popconfirm title="Delete this material?" onConfirm={() => remove("material", material.material_id)}><Button type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${material.title}`} /></Popconfirm>
                        </div>)}
                        <Button className="tutor-add-material" type="link" icon={<PlusOutlined />} onClick={() => openEditor({ kind: "material", lesson })}>Add Material</Button>
                      </article>
                    ))}
                  </div>}
                </section>
              ))}
            </div>
          )}
        </> : <Empty description="Class content not found" />}

        <Modal
          title={editor?.item ? `Edit ${editor.kind === "chapter" ? "Chapter" : editor.kind === "lesson" ? "Lesson" : "Material"}` : editor?.kind === "chapter" ? "Add Chapter" : editor?.kind === "lesson" ? "Add Lesson" : "Add Material"}
          open={Boolean(editor)} onCancel={() => setEditor(undefined)} onOk={saveEditor}
          confirmLoading={saving} okText={editor?.item ? "Save Changes" : editor?.kind === "chapter" ? "Add Chapter" : editor?.kind === "lesson" ? "Add Lesson" : "Add Material"}
          className="tutor-content-modal" destroyOnHidden
        >
          {editor?.kind === "lesson" && <Typography.Text type="secondary">Chapter · {editor.chapter.title}</Typography.Text>}
          {editor?.kind === "material" && <Typography.Text type="secondary">Lesson · {editor.lesson.title}</Typography.Text>}
          <Form form={form} layout="vertical" preserve={false}>
            {editor?.kind === "material" && <Form.Item noStyle shouldUpdate={(previous, current) => previous.material_type !== current.material_type}>{({ getFieldValue, setFieldValue }) => <Tabs
              activeKey={getFieldValue("material_type")}
              onChange={(value) => setFieldValue("material_type", value as MaterialKind)}
              items={[
                { key: "DOCUMENT", label: "Document", disabled: true },
                { key: "VIDEO", label: "Video", disabled: true },
                { key: "TEXT", label: "Rich Text" },
                { key: "URL", label: "External Link" },
              ]}
            />}</Form.Item>}
            <Form.Item name="title" label={editor?.kind === "material" ? "Material Title" : editor?.kind === "lesson" ? "Lesson Title" : "Chapter Title"} rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
            {editor?.kind !== "material" && <Form.Item name="description" label="Description"><Input.TextArea rows={3} /></Form.Item>}
            {editor?.kind === "lesson" && <Form.Item name="estimated_duration" label="Duration (minutes)"><InputNumber min={0} max={1440} style={{ width: "100%" }} /></Form.Item>}
            {editor?.kind === "material" && <Form.Item noStyle shouldUpdate={(previous, current) => previous.material_type !== current.material_type}>{({ getFieldValue }) => {
              const materialType = getFieldValue("material_type");
              if (materialType === "TEXT") return <Form.Item name="content" label="Content" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={6} /></Form.Item>;
              if (materialType === "URL") return <Form.Item name="file_url" label="HTTPS link" rules={[{ required: true }, { type: "url" }, { pattern: /^https:\/\//i, message: "Use an HTTPS link." }]}><Input placeholder="https://example.com/resource" /></Form.Item>;
              return <Alert type="info" showIcon message="File upload is waiting for the team’s storage and download contract." />;
            }}</Form.Item>}
            <Form.Item name="status" label="Visibility" rules={[{ required: true }]}><Select options={[{ value: "PUBLISHED", label: "Published" }, { value: "HIDDEN", label: "Hidden" }]} /></Form.Item>
            <Form.Item name="sequence_order" hidden><InputNumber /></Form.Item>
          </Form>
        </Modal>
      </main>
    </TutorWorkspaceLayout>
  );
}

function VisibilitySwitch({ status, onChange }: { status: ContentVisibility; onChange: (published: boolean) => void }) {
  return <span className="tutor-visibility"><Switch size="small" checked={status === "PUBLISHED"} onChange={onChange} /><span>{status === "PUBLISHED" ? "Published" : "Hidden"}</span></span>;
}

function errorText(error: unknown) {
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return "The request could not be completed.";
}
