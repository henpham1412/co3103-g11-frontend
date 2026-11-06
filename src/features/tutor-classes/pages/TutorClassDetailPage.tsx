import { useCallback, useEffect, useState } from "react";
import { Alert, Avatar, Button, Empty, Form, Input, InputNumber, Modal, Pagination, Select, Spin, Tag, Typography, message } from "antd";
import { Link, useParams } from "react-router-dom";
import TutorWorkspaceLayout from "../../../components/layout/TutorWorkspaceLayout";
import { getClassDetails } from "../../classes/api/classApi";
import type { ClassCatalogItem } from "../../classes/types";
import { approveTutorMember, getTutorClassMembers, rejectTutorMember, removeTutorMember, updateTutorClass } from "../api/tutorClassApi";
import type { TutorMember, TutorMemberPage } from "../types";

const PAGE_SIZE = 20;

export default function TutorClassDetailPage() {
  const { classId = "" } = useParams();
  const [details, setDetails] = useState<ClassCatalogItem>();
  const [activeMembers, setActiveMembers] = useState<TutorMemberPage>();
  const [pendingMembers, setPendingMembers] = useState<TutorMemberPage>();
  const [removeCandidate, setRemoveCandidate] = useState<TutorMember>();
  const [activePage, setActivePage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
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
    Promise.all([
      getClassDetails(classId, controller.signal),
      getTutorClassMembers(classId, { status: "ACTIVE", page: activePage, size: PAGE_SIZE }, controller.signal),
      getTutorClassMembers(classId, { status: "PENDING", page: pendingPage, size: PAGE_SIZE }, controller.signal),
    ])
      .then(([classDetails, active, pending]) => {
        setDetails(classDetails);
        setActiveMembers(active);
        setPendingMembers(pending);
        setError(undefined);
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(errorText(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [classId, activePage, pendingPage, reload]);

  async function act(memberId: string, action: "approve" | "reject") {
    setBusyMember(memberId);
    try {
      if (action === "approve") await approveTutorMember(classId, memberId);
      if (action === "reject") await rejectTutorMember(classId, memberId);
      message.success(action === "approve" ? "Join request approved." : "Join request rejected.");
      refresh();
    } catch (cause) { message.error(errorText(cause)); }
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
    } catch (cause) { message.error(errorText(cause)); }
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
    setEditOpen(true);
  }

  async function saveSettings() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await updateTutorClass(classId, values);
      message.success("Class settings updated.");
      setEditOpen(false);
      refresh();
    } catch (cause) { message.error(errorText(cause)); }
    finally { setSaving(false); }
  }

  return (
    <TutorWorkspaceLayout currentPage="Class Detail">
      <main className="tutor-page">
        <Link className="tutor-page__back" to="/tutor/classes">← Back to Class Management</Link>
        {error && <Alert type="error" showIcon message="Could not load class details" description={error} />}
        {loading ? <div className="tutor-page__loading"><Spin /></div> : details ? <>
          <section className="tutor-panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start" }}>
              <div><Typography.Text type="secondary">{details.class_code}</Typography.Text> <Tag color={details.status === "ACTIVE" ? "green" : "default"}>{details.status}</Tag><Typography.Title level={2}>{details.title}</Typography.Title><Typography.Paragraph type="secondary">{details.description || "No class description."}</Typography.Paragraph></div>
              <Button onClick={openEdit}>Edit Class Settings</Button>
            </div>
            <div className="tutor-class-detail-meta"><span>{details.tutor.full_name} · Tutor</span><span>{details.active_member_count}/{details.max_capacity ?? "∞"} Seats</span><Tag color="blue">{details.enrollment_policy}</Tag></div>
          </section>

          <section className="tutor-page__section tutor-panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}><div><h2>Class members</h2><div className="tutor-panel__sub">Membership is retained when a student leaves or is removed.</div></div><span>{activeMembers?.total_items ?? 0} active students · Capacity {details.max_capacity ?? "unlimited"}</span></div>
            {activeMembers?.items.length ? <><MemberTable members={activeMembers.items} busyMember={busyMember} onRemove={setRemoveCandidate} /><Pagination style={{ marginTop: 16, textAlign: "right" }} current={activePage} pageSize={PAGE_SIZE} total={activeMembers.total_items} showSizeChanger={false} onChange={setActivePage} /></> : <Empty description="No active members" />}
          </section>

          <section className="tutor-page__section tutor-panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}><div><h2>Pending Requests <Tag color="orange">{pendingMembers?.total_items ?? 0}</Tag></h2><div className="tutor-panel__sub">Pending requests do not consume seats.</div></div><span>{details.max_capacity === null ? "Capacity unlimited" : `${Math.max(0, details.max_capacity - details.active_member_count)} seats available`}</span></div>
            {pendingMembers?.items.length ? <><PendingTable members={pendingMembers.items} busyMember={busyMember} onAction={act} /><Pagination style={{ marginTop: 16, textAlign: "right" }} current={pendingPage} pageSize={PAGE_SIZE} total={pendingMembers.total_items} showSizeChanger={false} onChange={setPendingPage} /></> : <Empty description="No pending requests" />}
          </section>
        </> : <Empty description="Class not found" />}

        <Modal title="Edit Class Settings" open={editOpen} onCancel={() => setEditOpen(false)} onOk={saveSettings} confirmLoading={saving} okText="Save Changes">
          <Form form={form} layout="vertical">
            <Form.Item name="title" label="Title" rules={[{ required: true }, { max: 150 }]}><Input /></Form.Item>
            <Form.Item label="Class Code"><Input value={details?.class_code} disabled /></Form.Item>
            <Form.Item name="description" label="Description" rules={[{ max: 2000 }]}><Input.TextArea rows={3} /></Form.Item>
            <Form.Item name="max_capacity" label="Maximum Capacity"><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="prerequisites_description" label="Prerequisites"><Input /></Form.Item>
            <Form.Item name="enrollment_policy" label="Enrollment Policy"><Select options={[{ value: "OPEN", label: "Open enrollment" }, { value: "APPROVAL_REQUIRED", label: "Approval required" }]} /></Form.Item>
            <Form.Item name="status" label="Lifecycle Status"><Select options={[{ value: "ACTIVE", label: "Active" }, { value: "ARCHIVED", label: "Archived" }]} /></Form.Item>
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

function PendingTable({ members, busyMember, onAction }: { members: TutorMemberPage["items"]; busyMember?: string; onAction: (id: string, action: "approve" | "reject") => void }) {
  return <div style={{ overflowX: "auto" }}><table className="tutor-table"><thead><tr><th>Applicant</th><th>Requested</th><th>Actions</th></tr></thead><tbody>
    {members.map((member) => <tr key={member.class_member_id}><td title={member.student_id}>Student · {member.student_id.slice(0, 8)}</td><td>{member.requested_at ? new Date(member.requested_at).toLocaleString() : "—"}</td><td><div className="tutor-member-actions"><Button type="primary" loading={busyMember === member.class_member_id} onClick={() => onAction(member.class_member_id, "approve")}>Approve</Button><Button loading={busyMember === member.class_member_id} onClick={() => onAction(member.class_member_id, "reject")}>Reject</Button></div></td></tr>)}
  </tbody></table></div>;
}

function errorText(error: unknown) {
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return "The request could not be completed.";
}
