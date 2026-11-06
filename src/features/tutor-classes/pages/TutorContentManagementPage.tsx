import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Button, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select,
  Spin, Switch, Tabs, Tag, Tooltip, Typography, Upload, message,
} from "antd";
import {
  ArrowLeftOutlined, BookOutlined, DeleteOutlined, EditOutlined, FileTextOutlined,
  LinkOutlined, PlusOutlined, UpOutlined, DownOutlined, VideoCameraOutlined,
} from "@ant-design/icons";
import { Link, useParams } from "react-router-dom";
import TutorWorkspaceLayout from "../../../components/layout/TutorWorkspaceLayout";
import { getClassDetails } from "../../classes/api/classApi";
import { normalizeApiError } from "@/api/apiError";
import type { ClassCatalogItem } from "../../classes/types";
import {
  MATERIAL_UPLOAD_LIMITS, createChapter, createLesson, createMaterial, deleteChapter,
  materialExtensionAllowed,
  deleteLesson, deleteMaterial, getTutorOutline, reorderChapters, reorderLessons,
  swapMaterialOrder, updateChapter, updateLesson, updateMaterial, uploadMaterial,
} from "../api/tutorClassApi";
import type { ContentVisibility, MaterialKind, TutorChapter, TutorLesson, TutorMaterial, TutorOutline } from "../types";
import { contentErrorText, isStaleTutorState } from "../utils/tutorErrorText";

type Editor = { kind: "chapter"; item?: TutorChapter } | { kind: "lesson"; chapter: TutorChapter; item?: TutorLesson } | { kind: "material"; lesson: TutorLesson; item?: TutorMaterial };

export default function TutorContentManagementPage() {
  const { classId = "" } = useParams();
  const [classDetails, setClassDetails] = useState<ClassCatalogItem>();
  const [outline, setOutline] = useState<TutorOutline>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [editor, setEditor] = useState<Editor>();
  const [saving, setSaving] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [uploadFile, setUploadFile] = useState<File>();
  const [lastSaved, setLastSaved] = useState<string>();
  const [form] = Form.useForm();
  const [reload, setReload] = useState(0);

  const refresh = useCallback(() => { setLoading(true); setReload((value) => value + 1); }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getClassDetails(classId, controller.signal),
      getTutorOutline(classId, controller.signal),
    ])
      .then(([details, result]) => { setClassDetails(details); setOutline(result); setError(undefined); setPermissionDenied(false); })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (normalizeApiError(cause).status === 403) setPermissionDenied(true);
        setError(contentErrorText(cause));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [classId, reload]);

  const totals = useMemo(() => ({
    chapters: outline?.chapters.length ?? 0,
    lessons: outline?.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0) ?? 0,
    materials: outline?.chapters.reduce((sum, chapter) => sum + chapter.lessons.reduce((count, lesson) => count + lesson.materials.length, 0), 0) ?? 0,
  }), [outline]);

  function openEditor(next: Editor) {
    setUploadFile(undefined);
    setEditor(next);
  }

  useEffect(() => {
    if (!editor) return;
    form.resetFields();
    if (editor.kind === "chapter") {
      form.setFieldsValue(editor.item ? {
        title: editor.item.title, description: editor.item.description,
        status: editor.item.status,
      } : { status: "PUBLISHED" });
    } else if (editor.kind === "lesson") {
      form.setFieldsValue(editor.item ? {
        title: editor.item.title, description: editor.item.description,
        estimated_duration: editor.item.estimated_duration,
        status: editor.item.status,
      } : { estimated_duration: 30, status: "PUBLISHED" });
    } else {
      form.setFieldsValue(editor.item ? {
        title: editor.item.title, status: editor.item.status,
        material_type: editor.item.material_type,
        content: editor.item.content, file_url: editor.item.file_url,
      } : { status: "PUBLISHED", material_type: "TEXT" });
    }
  }, [editor, form]);

  async function saveEditor() {
    if (!editor) return;
    const values = await form.validateFields().catch(() => undefined);
    if (!values) return;
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
          // material_type is not patchable, so only the fields of the stored kind travel.
          const patch = {
            title: values.title,
            status: values.status,
            ...(editor.item.material_type === "TEXT" ? { content: values.content } : {}),
            ...(editor.item.material_type === "URL" ? { file_url: values.file_url } : {}),
          };
          await updateMaterial(editor.item.material_id, patch);
        } else if (values.material_type === "DOCUMENT" || values.material_type === "VIDEO") {
          if (!uploadFile) throw new Error("Choose a file to upload with this material.");
          await uploadMaterial(editor.lesson.lesson_id, { title: values.title, material_type: values.material_type, status: values.status }, uploadFile);
        } else {
          await createMaterial(editor.lesson.lesson_id, {
            title: values.title,
            material_type: values.material_type,
            status: values.status,
            ...(values.material_type === "TEXT" ? { content: values.content } : { file_url: values.file_url }),
          });
        }
      }
      message.success(`${editor.item ? "Changes saved for" : "Added"} ${editor.kind === "chapter" ? "chapter" : editor.kind === "lesson" ? "lesson" : "material"}.`);
      const parentNotice = values.status === "PUBLISHED" ? hiddenParentNotice(editor) : undefined;
      if (parentNotice) message.info(parentNotice);
      setLastSaved(new Date().toLocaleTimeString());
      setEditor(undefined);
      refresh();
    } catch (cause) {
      if (denyIfForbidden(cause)) return;
      message.error(contentErrorText(cause));
      if (isStaleTutorState(cause)) refresh();
    }
    finally { setSaving(false); }
  }

  function hiddenParentNotice(target: Editor): string | undefined {
    if (target.kind === "lesson" && target.chapter.status === "HIDDEN") {
      return `Students still cannot open this lesson while the chapter “${target.chapter.title}” is hidden.`;
    }
    if (target.kind === "material") {
      const chapter = outline?.chapters.find((item) => item.lessons.some((lesson) => lesson.lesson_id === target.lesson.lesson_id));
      if (chapter?.status === "HIDDEN") return `Students still cannot open this material while the chapter “${chapter.title}” is hidden.`;
      if (target.lesson.status === "HIDDEN") return `Students still cannot open this material while the lesson “${target.lesson.title}” is hidden.`;
    }
    return undefined;
  }

  function denyIfForbidden(cause: unknown) {
    if (normalizeApiError(cause).status !== 403) return false;
    setPermissionDenied(true);
    setEditor(undefined);
    message.error(contentErrorText(cause));
    return true;
  }

  async function toggleVisibility(kind: "chapter" | "lesson" | "material", id: string, published: boolean) {
    const status: ContentVisibility = published ? "PUBLISHED" : "HIDDEN";
    try {
      if (kind === "chapter") await updateChapter(id, { status });
      if (kind === "lesson") await updateLesson(id, { status });
      if (kind === "material") await updateMaterial(id, { status });
      if (status === "PUBLISHED") {
        const notice = kind === "chapter" ? undefined : hiddenParentNotice(visibilityTarget(kind, id));
        if (notice) message.info(notice);
      }
      setLastSaved(new Date().toLocaleTimeString());
      refresh();
    } catch (cause) {
      if (denyIfForbidden(cause)) return;
      message.error(contentErrorText(cause));
      if (isStaleTutorState(cause)) refresh();
    }
  }

  function visibilityTarget(kind: "lesson" | "material", id: string): Editor {
    const chapter = outline?.chapters.find((item) => item.lessons.some((lesson) =>
      kind === "lesson" ? lesson.lesson_id === id : lesson.materials.some((entry) => entry.material_id === id),
    ));
    const lesson = chapter?.lessons.find((item) =>
      kind === "lesson" ? item.lesson_id === id : item.materials.some((entry) => entry.material_id === id),
    );
    if (!chapter || !lesson) return { kind: "chapter" };
    return kind === "lesson" ? { kind: "lesson", chapter, item: lesson } : { kind: "material", lesson };
  }

  async function remove(kind: "chapter" | "lesson" | "material", id: string) {
    try {
      if (kind === "chapter") await deleteChapter(id);
      if (kind === "lesson") await deleteLesson(id);
      if (kind === "material") await deleteMaterial(id);
      message.success(`${kind[0].toUpperCase()}${kind.slice(1)} deleted.`);
      setLastSaved(new Date().toLocaleTimeString());
      refresh();
    } catch (cause) {
      if (denyIfForbidden(cause)) return;
      message.error(contentErrorText(cause));
      if (isStaleTutorState(cause)) refresh();
    }
  }

  async function moveChapter(index: number, offset: -1 | 1) {
    if (!outline) return;
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= outline.chapters.length) return;
    const items = [...outline.chapters];
    [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
    try { await reorderChapters(classId, items.map((item) => item.chapter_id)); refresh(); }
    catch (cause) { if (!denyIfForbidden(cause)) message.error(contentErrorText(cause)); }
  }

  async function moveLesson(chapter: TutorChapter, index: number, offset: -1 | 1) {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= chapter.lessons.length) return;
    const items = [...chapter.lessons];
    [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
    try { await reorderLessons(chapter.chapter_id, items.map((item) => item.lesson_id)); refresh(); }
    catch (cause) { if (!denyIfForbidden(cause)) message.error(contentErrorText(cause)); }
  }

  async function moveMaterial(lesson: TutorLesson, index: number, offset: -1 | 1) {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= lesson.materials.length) return;
    try { await swapMaterialOrder(lesson.materials[index], lesson.materials[nextIndex]); refresh(); }
    catch (cause) { if (!denyIfForbidden(cause)) message.error(contentErrorText(cause)); }
  }

  return (
    <TutorWorkspaceLayout currentPage="Content Management">
      <main className="tutor-page tutor-content-page">
        <Link className="tutor-page__back" to={`/tutor/classes/${classId}`}><ArrowLeftOutlined /> Back to Class Detail</Link>
        <div className="tutor-page__heading">
          <div><Typography.Title level={2}>Content Management</Typography.Title><Typography.Paragraph type="secondary">Organize chapters, lessons and materials for your classes.</Typography.Paragraph></div>
          {!permissionDenied && <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor({ kind: "chapter" })}>Add Chapter</Button>}
        </div>
        {error && !permissionDenied && <Alert type="error" showIcon title="Could not load class content" description={error} />}
        {loading ? <div className="tutor-page__loading"><Spin /></div> : permissionDenied ? (
          <Alert
            type="warning"
            showIcon
            title="Class content is not available to your account"
            description="The LMS refused this class, so no chapter, lesson or material is listed or editable. Content writes belong to the tutor assigned to the class."
          />
        ) : outline && classDetails ? <>
          <section className="tutor-content-classbar">
            <div className="tutor-content-classbar__icon"><BookOutlined /></div>
            <div><span>Editing curriculum for</span><strong>{classDetails.title}</strong></div>
            <Tag>{classDetails.class_code}</Tag>
            <Link to={`/tutor/classes/${classId}`}><Button>Open class</Button></Link>
          </section>
          <div className="tutor-content-summary"><div><strong>Curriculum</strong><span>{totals.chapters} chapters · {totals.lessons} lessons · {totals.materials} materials</span></div><span className="tutor-content-summary__saved">{lastSaved ? `Last change accepted at ${lastSaved}` : "No changes made in this session"}</span></div>
          <Alert className="tutor-content-tip" type="info" showIcon title="New content is published by default. Hidden parents make all nested content inaccessible to students." />
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
                          <div className="tutor-chapter-card__title"><strong>{chapterIndex + 1}.{lessonIndex + 1} · {lesson.title}</strong><span>{lesson.estimated_duration ?? "—"} mins{lesson.status === "HIDDEN" ? " · Hidden from students" : ""}{chapter.status === "HIDDEN" && lesson.status === "PUBLISHED" ? " · Published, but hidden with its chapter" : ""}</span></div>
                          <div className="tutor-content-actions"><VisibilitySwitch status={lesson.status} onChange={(value) => toggleVisibility("lesson", lesson.lesson_id, value)} /><Button size="small" type="text" icon={<EditOutlined />} aria-label={`Edit ${lesson.title}`} onClick={() => openEditor({ kind: "lesson", chapter, item: lesson })} /><Popconfirm title="Delete this lesson?" onConfirm={() => remove("lesson", lesson.lesson_id)}><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Popconfirm></div>
                        </header>
                        {lesson.materials.map((material, materialIndex) => <div className="tutor-material-row" key={material.material_id}>
                          <span className="tutor-reorder-buttons"><Button aria-label={`Move ${material.title} up`} size="small" type="text" icon={<UpOutlined />} disabled={materialIndex === 0} onClick={() => moveMaterial(lesson, materialIndex, -1)} /><Button aria-label={`Move ${material.title} down`} size="small" type="text" icon={<DownOutlined />} disabled={materialIndex === lesson.materials.length - 1} onClick={() => moveMaterial(lesson, materialIndex, 1)} /></span>
                          <div className="tutor-material-row__icon">{material.material_type === "URL" ? <LinkOutlined /> : material.material_type === "VIDEO" ? <VideoCameraOutlined /> : <FileTextOutlined />}</div>
                          <div className="tutor-material-row__title"><strong>{material.title}</strong><span>{material.material_type === "TEXT" ? "Rich Text" : material.material_type}{material.material_type === "DOCUMENT" || material.material_type === "VIDEO" ? " · students download through the LMS API" : ""}{!material.content && !material.file_url ? " · no content stored yet" : ""}{material.status === "PUBLISHED" && (chapter.status === "HIDDEN" || lesson.status === "HIDDEN") ? " · Published, but hidden with its parent" : ""}</span></div>
                          <VisibilitySwitch status={material.status} onChange={(value) => toggleVisibility("material", material.material_id, value)} />
                          <Button type="text" icon={<EditOutlined />} aria-label={`Edit ${material.title}`} onClick={() => openEditor({ kind: "material", lesson, item: material })} />
                          <Popconfirm title="Delete this material?" onConfirm={() => remove("material", material.material_id)}><Button type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${material.title}`} /></Popconfirm>
                        </div>)}
                        {(lesson.activities ?? []).map((activity) => (
                          <Link key={activity.activity_id} to={`/classes/${classId}/lessons/${lesson.lesson_id}/activities/${activity.activity_id}`}>
                            {activity.activity_type === "QUIZ" ? "Open quiz" : "Open assignment"} · {activity.title}
                          </Link>
                        ))}
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
              // The PATCH allowlist for a material has no material_type, so a stored kind is fixed.
              onChange={editor.item ? undefined : (value) => { setFieldValue("material_type", value as MaterialKind); setUploadFile(undefined); }}
              items={[
                { key: "DOCUMENT", label: "Document", disabled: Boolean(editor.item) },
                { key: "VIDEO", label: "Video", disabled: Boolean(editor.item) },
                { key: "TEXT", label: "Rich Text", disabled: Boolean(editor.item) },
                { key: "URL", label: "External Link", disabled: Boolean(editor.item) },
              ]}
            />}</Form.Item>}
            {editor?.kind === "material" && <Form.Item name="material_type" hidden><Input /></Form.Item>}
            <Form.Item name="title" label={editor?.kind === "material" ? "Material Title" : editor?.kind === "lesson" ? "Lesson Title" : "Chapter Title"} rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
            {editor?.kind !== "material" && <Form.Item name="description" label="Description"><Input.TextArea rows={3} /></Form.Item>}
            {editor?.kind === "lesson" && <Form.Item name="estimated_duration" label="Duration (minutes)"><InputNumber min={0} max={1440} style={{ width: "100%" }} /></Form.Item>}
            {editor?.kind === "material" && <Form.Item noStyle shouldUpdate={(previous, current) => previous.material_type !== current.material_type}>{({ getFieldValue }) => {
              const materialType = getFieldValue("material_type") as MaterialKind;
              if (materialType === "TEXT") return <Form.Item name="content" label="Content" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={6} /></Form.Item>;
              if (materialType === "URL") return <Form.Item name="file_url" label="HTTPS link" rules={[{ required: true }, { type: "url" }, { pattern: /^https:\/\//i, message: "Use an HTTPS link." }]}><Input placeholder="https://example.com/resource" /></Form.Item>;
              if (editor.item) return <Typography.Text type="secondary">The stored file is replaced by uploading a new material; the API has no in-place asset swap.</Typography.Text>;
              const limit = MATERIAL_UPLOAD_LIMITS[materialType as "DOCUMENT" | "VIDEO"];
              return <Form.Item label="File" required extra={limit.label}>
                <Upload
                  accept={limit.accept}
                  maxCount={1}
                  fileList={uploadFile ? [{ uid: "upload", name: uploadFile.name }] : []}
                  beforeUpload={(file) => {
                    if (!materialExtensionAllowed(materialType as "DOCUMENT" | "VIDEO", file.name)) {
                      message.error(`That file type is not supported for this material kind.`);
                      return Upload.LIST_IGNORE;
                    }
                    if (file.size > limit.maxBytes) {
                      message.error(`This ${materialType.toLowerCase()} file is larger than ${Math.round(limit.maxBytes / (1024 * 1024))} MB.`);
                      return Upload.LIST_IGNORE;
                    }
                    setUploadFile(file);
                    return false;
                  }}
                  onRemove={() => { setUploadFile(undefined); return true; }}
                >
                  <Button icon={<PlusOutlined />}>Choose file</Button>
                </Upload>
              </Form.Item>;
            }}</Form.Item>}
            <Form.Item name="status" label="Visibility" rules={[{ required: true }]}><Select options={[{ value: "PUBLISHED", label: "Published" }, { value: "HIDDEN", label: "Hidden" }]} /></Form.Item>
          </Form>
        </Modal>
      </main>
    </TutorWorkspaceLayout>
  );
}

function VisibilitySwitch({ status, onChange }: { status: ContentVisibility; onChange: (published: boolean) => void }) {
  return <span className="tutor-visibility"><Switch size="small" checked={status === "PUBLISHED"} onChange={onChange} /><span>{status === "PUBLISHED" ? "Published" : "Hidden"}</span></span>;
}
