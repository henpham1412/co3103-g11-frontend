import { useCallback, useEffect, useState } from "react";
import { Alert, App, Avatar, Button, Card, Collapse, Empty, Form, Input, InputNumber, Modal, Pagination, Progress, Select, Spin, Tag, Tooltip, Typography, Upload } from "antd";
import { FolderOpenOutlined } from "@ant-design/icons";
import { Link, useParams } from "react-router-dom";
import TutorWorkspaceLayout from "../../../components/layout/TutorWorkspaceLayout";
import { getClassDetails } from "../../classes/api/classApi";
import { normalizeApiError } from "@/api/apiError";
import type { ClassCatalogItem } from "../../classes/types";
import { approveTutorMember, getTutorClassMembers, getTutorClassProgress, getTutorMemberProgress, getTutorOutline, rejectTutorMember, removeTutorMember, updateTutorClass, uploadClassThumbnail } from "../api/tutorClassApi";
import type { TutorMember, TutorMemberPage, TutorOutline, TutorProgressResponse, TutorMemberProgressResponse } from "../types";
import { isStaleTutorState, tutorErrorText } from "../utils/tutorErrorText";

const PAGE_SIZE = 20;
const THUMBNAIL_TYPES = ["image/jpeg", "image/png", "image/webp"];
const THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;
const ROSTER_QUERY_MAX = 100;
const ROSTER_SORTS = [
  { value: "requested_at,desc", label: "Requested, newest first" },
  { value: "requested_at,asc", label: "Requested, oldest first" },
  { value: "joined_at,desc", label: "Joined, newest first" },
  { value: "joined_at,asc", label: "Joined, oldest first" },
  { value: "status,asc", label: "Membership status" },
];

export default function TutorClassDetailPage() {
  const { message } = App.useApp();
  const { classId = "" } = useParams();
  const [details, setDetails] = useState<ClassCatalogItem>();
  const [activeMembers, setActiveMembers] = useState<TutorMemberPage>();
  const [pendingMembers, setPendingMembers] = useState<TutorMemberPage>();
  const [removeCandidate, setRemoveCandidate] = useState<TutorMember>();
  const [outline, setOutline] = useState<TutorOutline>();
  const [activeTab, setActiveTab] = useState<"syllabus" | "members" | "progress">("syllabus");
  const [progress, setProgress] = useState<TutorProgressResponse>();
  const [progressError, setProgressError] = useState<string>();
  const [selectedProgressMember, setSelectedProgressMember] = useState<string>();
  const [memberProgress, setMemberProgress] = useState<TutorMemberProgressResponse>();
  const [memberProgressError, setMemberProgressError] = useState<string>();
  const [activePage, setActivePage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [sort, setSort] = useState("requested_at,desc");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [busyMember, setBusyMember] = useState<string>();
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [reload, setReload] = useState(0);

  const refresh = useCallback(() => { setLoading(true); setReload((value) => value + 1); }, []);

  useEffect(() => {
    const controller = new AbortController();
    const roster = { q: searchApplied.trim() || undefined, sort, size: PAGE_SIZE };
    Promise.all([
      getClassDetails(classId, controller.signal),
      getTutorClassMembers(classId, { ...roster, status: "ACTIVE", page: activePage }, controller.signal),
      getTutorClassMembers(classId, { ...roster, status: "PENDING", page: pendingPage }, controller.signal),
      getTutorOutline(classId, controller.signal),
    ])
      .then(([classDetails, active, pending, classOutline]) => {
        setDetails(classDetails);
        if (classDetails.status === "ARCHIVED") setActiveTab("members");
        setActiveMembers(active);
        setPendingMembers(pending);
        setOutline(classOutline);
        setError(undefined);
        setPermissionDenied(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (normalizeApiError(cause).status === 403) setPermissionDenied(true);
        setError(tutorErrorText(cause));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [classId, activePage, pendingPage, searchApplied, sort, reload]);

  useEffect(() => {
    if (activeTab !== "progress") return;
    const controller = new AbortController();
    getTutorClassProgress(classId, controller.signal)
      .then((value) => { setProgress(value); setProgressError(undefined); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setProgressError(tutorErrorText(cause)); });
    return () => controller.abort();
  }, [activeTab, classId, reload]);

  useEffect(() => {
    if (!selectedProgressMember) return;
    const controller = new AbortController();
    getTutorMemberProgress(classId, selectedProgressMember, controller.signal)
      .then((value) => { setMemberProgress(value); setMemberProgressError(undefined); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setMemberProgressError(tutorErrorText(cause)); });
    return () => controller.abort();
  }, [classId, selectedProgressMember]);

  function runRosterSearch() {
    setActivePage(1);
    setPendingPage(1);
    setSearchApplied(search);
  }

  async function act(memberId: string, action: "approve" | "reject") {
    setBusyMember(memberId);
    try {
      if (action === "approve") await approveTutorMember(classId, memberId);
      if (action === "reject") await rejectTutorMember(classId, memberId);
      message.success(action === "approve" ? "Join request approved." : "Join request rejected.");
      refresh();
    } catch (cause) {
      message.error(tutorErrorText(cause));
      if (isStaleTutorState(cause)) refresh();
    }
    finally { setBusyMember(undefined); }
  }

  async function confirmRemove() {
    if (!removeCandidate) return;
    setBusyMember(removeCandidate.class_member_id);
    try {
      await removeTutorMember(classId, removeCandidate.class_member_id);
      message.success("Member removed. Learning records are retained.");
      setRemoveCandidate(undefined);
      refresh();
    } catch (cause) {
      message.error(tutorErrorText(cause));
      if (isStaleTutorState(cause)) refresh();
    }
    finally { setBusyMember(undefined); }
  }

  function openEdit() {
    if (!details) return;
    form.setFieldsValue({
      title: details.title,
      description: details.description,
      prerequisites_description: details.prerequisites_description,
      max_capacity: details.max_capacity,
      enrollment_policy: details.enrollment_policy,
      status: details.status,
    });
    setThumbnailFile(undefined);
    setEditOpen(true);
  }

  async function saveSettings() {
    const values = await form.validateFields().catch(() => undefined);
    if (!values) return;
    const settings = {
      ...values,
      title: typeof values.title === "string" ? values.title.trim() : values.title,
      description: typeof values.description === "string" ? values.description.trim() : values.description,
      prerequisites_description: typeof values.prerequisites_description === "string"
        ? values.prerequisites_description.trim()
        : values.prerequisites_description,
    };
    setSaving(true);
    try {
      try {
        await updateTutorClass(classId, settings);
      } catch (cause) {
        message.error(tutorErrorText(cause));
        if (isStaleTutorState(cause)) refresh();
        return;
      }
      if (thumbnailFile) {
        try {
          await uploadClassThumbnail(classId, thumbnailFile);
        } catch (cause) {
          message.warning(`Class settings were saved. The thumbnail was not replaced: ${tutorErrorText(cause)}`);
          setEditOpen(false);
          refresh();
          return;
        }
      }
      message.success("Class settings updated.");
      setEditOpen(false);
      refresh();
    } finally { setSaving(false); }
  }

  const seatsAvailable = details?.max_capacity == null ? null : Math.max(0, details.max_capacity - details.active_member_count);
  const archived = details?.status === "ARCHIVED";

  return (
    <TutorWorkspaceLayout currentPage="Class Detail">
      <main className="tutor-page">
        <Link className="tutor-page__back" to="/tutor/classes">← Back to Class Management</Link>
        {error && !permissionDenied && <Alert className="tutor-page__notice" type="error" showIcon title="Could not load class details" description={error} />}
        {loading ? <div className="tutor-page__loading"><Spin /></div> : permissionDenied ? (
          <Alert
            className="tutor-page__notice"
            type="warning"
            showIcon
            title="This class is not available in your tutor workspace"
            description="The LMS refused this request, so class details and enrollment actions stay hidden. Only classes you are assigned to can be managed here."
          />
        ) : details ? <>
          <section className="tutor-panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start" }}>
              <div><Typography.Text type="secondary">{details.class_code}</Typography.Text> <Tag color={details.status === "ACTIVE" ? "green" : "default"}>{details.status}</Tag><Typography.Title level={2}>{details.title}</Typography.Title><Typography.Paragraph type="secondary">{details.description || "No class description."}</Typography.Paragraph></div>
              <Button onClick={openEdit}>Edit Class Settings</Button>
            </div>
            <div className="tutor-class-detail-meta"><span>{details.tutor.full_name} · Tutor</span><span>{details.active_member_count}/{details.max_capacity ?? "∞"} Seats</span><Tag color="blue">{details.enrollment_policy}</Tag></div>
          </section>
          {archived && <Alert className="tutor-page__notice" type="info" showIcon message="This class is archived" description="Approve, reject and remove stay closed. Set the lifecycle back to Active before changing membership." />}

          <div className="tutor-page__tabs" role="tablist"><button className={activeTab === "syllabus" ? "is-active" : ""} type="button" role="tab" aria-selected={activeTab === "syllabus"} onClick={() => setActiveTab("syllabus")}>Course Syllabus</button><button className={activeTab === "members" ? "is-active" : ""} type="button" role="tab" aria-selected={activeTab === "members"} onClick={() => setActiveTab("members")}>Member <Tag>{activeMembers?.total_items ?? 0}</Tag></button><button className={activeTab === "progress" ? "is-active" : ""} type="button" role="tab" aria-selected={activeTab === "progress"} onClick={() => setActiveTab("progress")}>Progress</button></div>
          {activeTab === "syllabus" ? <section className="tutor-panel tutor-syllabus">
            <header className="tutor-syllabus__heading"><div><h2>Course Syllabus</h2><span>{outline?.chapters.length ?? 0} chapters · {outline?.chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0) ?? 0} lessons</span></div><Link to={`/tutor/classes/${classId}/content`}><Button icon={<FolderOpenOutlined />}>Manage content</Button></Link></header>
            <Alert type="info" showIcon title="Tutor preview includes hidden content. Students can only access published content inside published chapters." />
            {outline?.chapters.length ? <div className="tutor-syllabus__chapters">{outline.chapters.map((chapter, index) => <article className="tutor-syllabus__chapter" key={chapter.chapter_id}><header><strong>Chapter {index + 1} · {chapter.title}</strong><Tag color={chapter.status === "PUBLISHED" ? "green" : "default"}>{chapter.status}</Tag></header>{chapter.lessons.map((lesson, lessonIndex) => <div className="tutor-syllabus__lesson" key={lesson.lesson_id}><span>{index + 1}.{lessonIndex + 1} · {lesson.title}</span><span>{lesson.estimated_duration ?? "—"} mins · {lesson.status}</span></div>)}</article>)}</div> : <Empty description="No syllabus content yet" />}
          </section> : activeTab === "progress" ? <section className="tutor-page__section tutor-panel">
            <div><h2>Learning progress</h2><div className="tutor-panel__sub">Progress is shown for active members only. Former members remain retained by the LMS but are not listed.</div></div>
            {progressError ? <Alert type="error" showIcon title="Could not load member progress" description={progressError} /> : progress?.members.length ? <TableProgress members={progress.members} selected={selectedProgressMember} onSelect={(memberId) => { setMemberProgress(undefined); setMemberProgressError(undefined); setSelectedProgressMember(memberId); }} /> : <Empty description="No active member progress is available" />}
            {memberProgressError && <Alert style={{ marginTop: 20 }} type="error" showIcon title="Could not load student progress" description={memberProgressError} />}
            {memberProgress && <Card style={{ marginTop: 20 }} title={memberProgress.student_name ?? `Student ${memberProgress.student_id}`}>
              <Progress percent={memberProgress.progress_percentage} />
              <Typography.Text>{memberProgress.completed_lessons} of {memberProgress.eligible_lessons} lessons complete · {memberProgress.status}</Typography.Text>
              <Collapse style={{ marginTop: 16 }} items={memberProgress.chapters.map((chapter) => ({ key: chapter.chapter_id, label: chapter.title, children: chapter.lessons.map((lesson) => <div key={lesson.lesson_id}>{lesson.completed ? "✓" : "○"} {lesson.title}</div>) }))} />
              {memberProgress.assessment_outcomes?.length ? <div style={{ marginTop: 16 }}><Typography.Title level={5}>Assessment outcomes</Typography.Title>{memberProgress.assessment_outcomes.map((outcome) => <div key={outcome.activity_id}>{outcome.activity_title} · {outcome.status}{outcome.score == null ? "" : ` · ${outcome.score}%`}{outcome.feedback ? ` · ${outcome.feedback}` : ""}</div>)}</div> : null}
              {memberProgress.mastery?.length ? <div style={{ marginTop: 16 }}>{memberProgress.mastery.map((item) => <Tag key={item.skill_topic}>{item.skill_topic}: {item.mastery == null ? "—" : `${item.mastery}%`}</Tag>)}</div> : null}
            </Card>}
          </section> : <>
          <section className="tutor-page__section tutor-panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}><div><h2>Class members</h2><div className="tutor-panel__sub">Search matches the student name or email on the server, up to {ROSTER_QUERY_MAX} characters, and applies to both lists. The roster response only includes a student id, so names are not shown. Ordering is also applied by the server.</div></div><span>{activeMembers?.total_items ?? 0} active students · Capacity {details.max_capacity ?? "unlimited"}</span></div>
            <div className="tutor-class-filters">
              <Input.Search allowClear maxLength={ROSTER_QUERY_MAX} placeholder="Search by name or email" value={search} onChange={(event) => setSearch(event.target.value)} onSearch={runRosterSearch} />
              <Select value={sort} onChange={(value) => { setActivePage(1); setPendingPage(1); setSort(value); }} options={ROSTER_SORTS} aria-label="Roster ordering" />
              <Button onClick={runRosterSearch}>Apply filters</Button>
            </div>
            {activeMembers?.items.length ? <><MemberTable members={activeMembers.items} busyMember={busyMember} archived={archived} onRemove={setRemoveCandidate} /><Pagination style={{ marginTop: 16, textAlign: "right" }} current={activePage} pageSize={PAGE_SIZE} total={activeMembers.total_items} showSizeChanger={false} onChange={setActivePage} /></> : <Empty description={searchApplied ? "No active member matches this search" : "No active members"} />}
          </section>

          <section className="tutor-page__section tutor-panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}><div><h2>Pending Requests <Tag color="orange">{pendingMembers?.total_items ?? 0}</Tag></h2><div className="tutor-panel__sub">Approve moves a request to ACTIVE and consumes a seat. Reject marks it REJECTED and keeps the membership record, so the student can request again. Pending requests do not consume seats.</div></div><span>{seatsAvailable === null ? "Capacity unlimited" : `${seatsAvailable} seats available`}</span></div>
            {pendingMembers?.items.length ? <>
              {seatsAvailable === 0 && !archived && <Alert className="tutor-page__notice" type="warning" showIcon title="This class is full" description="Approving needs a free seat, so approvals are blocked until capacity increases or a member is removed." />}
              <PendingTable members={pendingMembers.items} busyMember={busyMember} archived={archived} canApprove={!archived && seatsAvailable !== 0} onAction={act} />
              <Pagination style={{ marginTop: 16, textAlign: "right" }} current={pendingPage} pageSize={PAGE_SIZE} total={pendingMembers.total_items} showSizeChanger={false} onChange={setPendingPage} />
            </> : <Empty description={searchApplied ? "No pending request matches this search" : "No pending requests"} />}
          </section>
          </>}
        </> : <Empty description="Class not found" />}

        <Modal title="Edit Class Settings" open={editOpen} onCancel={() => setEditOpen(false)} onOk={saveSettings} confirmLoading={saving} okText="Save Changes">
          <Form form={form} layout="vertical">
            <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true }, { max: 150 }]}><Input /></Form.Item>
            <Form.Item label="Class Code"><Input value={details?.class_code} disabled /></Form.Item>
            <Form.Item name="description" label="Description" rules={[{ max: 2000 }]}><Input.TextArea rows={3} /></Form.Item>
            <Form.Item name="max_capacity" label="Maximum Capacity" extra={`Currently ${details?.active_member_count ?? 0} students hold a seat. Leave empty for unlimited.`}><InputNumber min={1} precision={0} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="prerequisites_description" label="Prerequisites"><Input /></Form.Item>
            <Form.Item name="enrollment_policy" label="Enrollment Policy"><Select options={[{ value: "OPEN", label: "Open enrollment" }, { value: "APPROVAL_REQUIRED", label: "Approval required" }]} /></Form.Item>
            <Form.Item name="status" label="Lifecycle Status"><Select options={[{ value: "ACTIVE", label: "Active" }, { value: "ARCHIVED", label: "Archived" }]} /></Form.Item>
            <Form.Item label="Thumbnail" extra="JPEG, PNG or WebP up to 5 MB. Stored separately from the class settings.">
              <Upload
                accept={THUMBNAIL_TYPES.join(",")}
                maxCount={1}
                listType="picture"
                fileList={thumbnailFile ? [{ uid: "thumbnail", name: thumbnailFile.name, status: "done" }] : []}
                beforeUpload={(file) => {
                  if (!THUMBNAIL_TYPES.includes(file.type)) {
                    message.error("Choose a JPEG, PNG or WebP image.");
                    return Upload.LIST_IGNORE;
                  }
                  if (file.size > THUMBNAIL_MAX_BYTES) {
                    message.error("The thumbnail must be 5 MB or smaller.");
                    return Upload.LIST_IGNORE;
                  }
                  setThumbnailFile(file);
                  return false;
                }}
                onRemove={() => setThumbnailFile(undefined)}
              >
                <Button>Choose image</Button>
              </Upload>
            </Form.Item>
          </Form>
        </Modal>
        <Modal title="Remove Student from Class?" open={Boolean(removeCandidate)} onCancel={() => setRemoveCandidate(undefined)} onOk={confirmRemove} confirmLoading={busyMember === removeCandidate?.class_member_id} okText="Remove Member" okButtonProps={{ danger: true }}>
          {removeCandidate && <div className="tutor-remove-confirm"><div className="tutor-remove-confirm__student"><Avatar>{removeCandidate.student_id.slice(0, 2).toUpperCase()}</Avatar><div><strong>Student · {removeCandidate.student_id.slice(0, 8)}</strong><span>{details?.title} · {details?.class_code}</span></div></div><p>Removing this active student sets the membership to INACTIVE, revokes class content, and releases their seat. The membership record stays.</p><div className="tutor-remove-confirm__records"><strong>Learning records are retained</strong><span>Completion history, submissions and grades are kept. The student account is not deleted.</span></div></div>}
        </Modal>
      </main>
    </TutorWorkspaceLayout>
  );
}

function MemberTable({ members, busyMember, archived, onRemove }: { members: TutorMemberPage["items"]; busyMember?: string; archived: boolean; onRemove: (member: TutorMember) => void }) {
  return <div style={{ overflowX: "auto" }}><table className="tutor-table"><thead><tr><th>Student</th><th>Membership</th><th>Actions</th></tr></thead><tbody>
    {members.map((member) => <tr key={member.class_member_id}><td><Avatar size={30}>{member.student_id.slice(0, 2).toUpperCase()}</Avatar> <span title={member.student_id}>Student · {member.student_id.slice(0, 8)}</span></td><td><Tag color="green">{member.status}</Tag></td><td><div className="tutor-member-actions"><Button danger disabled={archived || (Boolean(busyMember) && busyMember !== member.class_member_id)} loading={busyMember === member.class_member_id} onClick={() => onRemove(member)}>Remove</Button></div></td></tr>)}
  </tbody></table></div>;
}

function PendingTable({ members, busyMember, archived, canApprove, onAction }: { members: TutorMemberPage["items"]; busyMember?: string; archived: boolean; canApprove: boolean; onAction: (id: string, action: "approve" | "reject") => void }) {
  return <div style={{ overflowX: "auto" }}><table className="tutor-table"><thead><tr><th>Applicant</th><th>Requested</th><th>Actions</th></tr></thead><tbody>
    {members.map((member) => {
      const locked = archived || (Boolean(busyMember) && busyMember !== member.class_member_id);
      const approveReason = archived ? "Archived classes do not accept membership changes" : canApprove ? undefined : "No seats left in this class";
      return <tr key={member.class_member_id}><td title={member.student_id}>Student · {member.student_id.slice(0, 8)}</td><td>{member.requested_at ? new Date(member.requested_at).toLocaleString() : "—"}</td><td><div className="tutor-member-actions"><Tooltip title={approveReason}><Button type="primary" disabled={!canApprove || locked} loading={busyMember === member.class_member_id} onClick={() => onAction(member.class_member_id, "approve")}>Approve</Button></Tooltip><Button disabled={locked} loading={busyMember === member.class_member_id} onClick={() => onAction(member.class_member_id, "reject")}>Reject</Button></div></td></tr>;
    })}
  </tbody></table></div>;
}

function TableProgress({ members, selected, onSelect }: {
  members: NonNullable<TutorProgressResponse["members"]>;
  selected?: string;
  onSelect: (memberId: string) => void;
}) {
  return <div className="tutor-syllabus__chapters">
    {members.map((member) => <button
      type="button"
      key={member.class_member_id}
      onClick={() => onSelect(member.class_member_id)}
      style={{ display: "grid", gridTemplateColumns: "1fr auto", width: "100%", textAlign: "left", padding: 14, border: selected === member.class_member_id ? "2px solid #2563eb" : "1px solid #e5e7eb", background: "white", borderRadius: 6, cursor: "pointer" }}
    >
      <span>{member.student_name ?? `Student ${member.student_id}`}<br /><Typography.Text type="secondary">{member.completed_lessons}/{member.eligible_lessons} lessons · {member.status}</Typography.Text></span>
      <Progress type="circle" size={48} percent={member.progress_percentage} />
    </button>)}
  </div>;
}
