import { useCallback, useEffect, useState } from "react";
import { Alert, Avatar, Button, Empty, Form, Input, InputNumber, Modal, Pagination, Select, Spin, Tag, Tooltip, Typography, Upload, message } from "antd";
import { Link, useParams } from "react-router-dom";
import TutorWorkspaceLayout from "../../../components/layout/TutorWorkspaceLayout";
import { getClassDetails } from "../../classes/api/classApi";
import { normalizeApiError } from "@/api/apiError";
import type { ClassCatalogItem } from "../../classes/types";
import { approveTutorMember, getTutorClassMembers, rejectTutorMember, removeTutorMember, updateTutorClass, uploadClassThumbnail } from "../api/tutorClassApi";
import type { TutorMember, TutorMemberPage } from "../types";
import { isStaleTutorState, tutorErrorText } from "../utils/tutorErrorText";

const PAGE_SIZE = 20;
const THUMBNAIL_TYPES = ["image/jpeg", "image/png", "image/webp"];
const THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;
const ROSTER_SORTS = [
  { value: "requested_at,desc", label: "Requested, newest first" },
  { value: "requested_at,asc", label: "Requested, oldest first" },
  { value: "joined_at,desc", label: "Joined, newest first" },
  { value: "joined_at,asc", label: "Joined, oldest first" },
  { value: "status,asc", label: "Membership status" },
];

export default function TutorClassDetailPage() {
  const { classId = "" } = useParams();
  const [details, setDetails] = useState<ClassCatalogItem>();
  const [activeMembers, setActiveMembers] = useState<TutorMemberPage>();
  const [pendingMembers, setPendingMembers] = useState<TutorMemberPage>();
  const [removeCandidate, setRemoveCandidate] = useState<TutorMember>();
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
    ])
      .then(([classDetails, active, pending]) => {
        setDetails(classDetails);
        setActiveMembers(active);
        setPendingMembers(pending);
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
    setSaving(true);
    try {
      await updateTutorClass(classId, values);
      if (thumbnailFile) await uploadClassThumbnail(classId, thumbnailFile);
      message.success("Class settings updated.");
      setEditOpen(false);
      refresh();
    } catch (cause) {
      message.error(tutorErrorText(cause));
      if (isStaleTutorState(cause)) refresh();
    }
    finally { setSaving(false); }
  }

  const seatsAvailable = details?.max_capacity == null ? null : Math.max(0, details.max_capacity - details.active_member_count);

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

          <section className="tutor-page__section tutor-panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}><div><h2>Class members</h2><div className="tutor-panel__sub">Membership is retained when a student leaves or is removed. Search and ordering run on the server, so they apply to both rosters below.</div></div><span>{activeMembers?.total_items ?? 0} active students · Capacity {details.max_capacity ?? "unlimited"}</span></div>
            <div className="tutor-class-filters">
              <Input.Search allowClear placeholder="Search by student identifier" value={search} onChange={(event) => setSearch(event.target.value)} onSearch={runRosterSearch} />
              <Select value={sort} onChange={setSort} options={ROSTER_SORTS} aria-label="Roster ordering" />
              <Button onClick={runRosterSearch}>Apply filters</Button>
            </div>
            {activeMembers?.items.length ? <><MemberTable members={activeMembers.items} busyMember={busyMember} onRemove={setRemoveCandidate} /><Pagination style={{ marginTop: 16, textAlign: "right" }} current={activePage} pageSize={PAGE_SIZE} total={activeMembers.total_items} showSizeChanger={false} onChange={setActivePage} /></> : <Empty description={searchApplied ? "No active member matches this search" : "No active members"} />}
          </section>

          <section className="tutor-page__section tutor-panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}><div><h2>Pending Requests <Tag color="orange">{pendingMembers?.total_items ?? 0}</Tag></h2><div className="tutor-panel__sub">Approve moves a request to ACTIVE and consumes a seat. Reject removes the request without touching the student account. Pending requests do not consume seats.</div></div><span>{seatsAvailable === null ? "Capacity unlimited" : `${seatsAvailable} seats available`}</span></div>
            {pendingMembers?.items.length ? <>
              {seatsAvailable === 0 && <Alert className="tutor-page__notice" type="warning" showIcon title="This class is full" description="Approving needs a free seat, so approvals are blocked until capacity increases or a member is removed." />}
              <PendingTable members={pendingMembers.items} busyMember={busyMember} canApprove={seatsAvailable !== 0} onAction={act} />
              <Pagination style={{ marginTop: 16, textAlign: "right" }} current={pendingPage} pageSize={PAGE_SIZE} total={pendingMembers.total_items} showSizeChanger={false} onChange={setPendingPage} />
            </> : <Empty description={searchApplied ? "No pending request matches this search" : "No pending requests"} />}
          </section>
        </> : <Empty description="Class not found" />}

        <Modal title="Edit Class Settings" open={editOpen} onCancel={() => setEditOpen(false)} onOk={saveSettings} confirmLoading={saving} okText="Save Changes">
          <Form form={form} layout="vertical">
            <Form.Item name="title" label="Title" rules={[{ required: true }, { max: 150 }]}><Input /></Form.Item>
            <Form.Item label="Class Code"><Input value={details?.class_code} disabled /></Form.Item>
            <Form.Item name="description" label="Description" rules={[{ max: 2000 }]}><Input.TextArea rows={3} /></Form.Item>
            <Form.Item name="max_capacity" label="Maximum Capacity" extra={`Currently ${details?.active_member_count ?? 0} students hold a seat.`}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
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
          {removeCandidate && <div className="tutor-remove-confirm"><div className="tutor-remove-confirm__student"><Avatar>{removeCandidate.student_id.slice(0, 2).toUpperCase()}</Avatar><div><strong>Student · {removeCandidate.student_id.slice(0, 8)}</strong><span>{details?.title} · {details?.class_code}</span></div></div><p>Removing this active student revokes access to class content and releases their seat.</p><div className="tutor-remove-confirm__records"><strong>Learning records are retained</strong><span>Completion history, submissions and grades are kept. The student account is not deleted.</span></div></div>}
        </Modal>
      </main>
    </TutorWorkspaceLayout>
  );
}

function MemberTable({ members, busyMember, onRemove }: { members: TutorMemberPage["items"]; busyMember?: string; onRemove: (member: TutorMember) => void }) {
  return <div style={{ overflowX: "auto" }}><table className="tutor-table"><thead><tr><th>Student</th><th>Membership</th><th>Progress</th><th>Actions</th></tr></thead><tbody>
    {members.map((member) => <tr key={member.class_member_id}><td><Avatar size={30}>{member.student_id.slice(0, 2).toUpperCase()}</Avatar> <span title={member.student_id}>Student · {member.student_id.slice(0, 8)}</span></td><td><Tag color="green">Active</Tag></td><td>—</td><td><div className="tutor-member-actions"><Button danger loading={busyMember === member.class_member_id} onClick={() => onRemove(member)}>Remove</Button></div></td></tr>)}
  </tbody></table></div>;
}

function PendingTable({ members, busyMember, canApprove, onAction }: { members: TutorMemberPage["items"]; busyMember?: string; canApprove: boolean; onAction: (id: string, action: "approve" | "reject") => void }) {
  return <div style={{ overflowX: "auto" }}><table className="tutor-table"><thead><tr><th>Applicant</th><th>Requested</th><th>Actions</th></tr></thead><tbody>
    {members.map((member) => <tr key={member.class_member_id}><td title={member.student_id}>Student · {member.student_id.slice(0, 8)}</td><td>{member.requested_at ? new Date(member.requested_at).toLocaleString() : "—"}</td><td><div className="tutor-member-actions"><Tooltip title={canApprove ? undefined : "No seats left in this class"}><Button type="primary" disabled={!canApprove} loading={busyMember === member.class_member_id} onClick={() => onAction(member.class_member_id, "approve")}>Approve</Button></Tooltip><Button loading={busyMember === member.class_member_id} onClick={() => onAction(member.class_member_id, "reject")}>Reject</Button></div></td></tr>)}
  </tbody></table></div>;
}
