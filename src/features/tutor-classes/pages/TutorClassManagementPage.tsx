import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Form, Input, InputNumber, Modal, Pagination, Popconfirm, Select, Spin, Tag, Typography, message } from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import TutorWorkspaceLayout from "../../../components/layout/TutorWorkspaceLayout";
import { getClassDetails } from "../../classes/api/classApi";
import type { ClassCatalogItem } from "../../classes/types";
import { createTutorClass, getTutorClasses, updateTutorClass } from "../api/tutorClassApi";
import type { CreateTutorClass, TutorClass } from "../types";

const PAGE_SIZE = 20;

export default function TutorClassManagementPage() {
  const [classes, setClasses] = useState<TutorClass[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedDetails, setSelectedDetails] = useState<ClassCatalogItem>();
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "ARCHIVED">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<CreateTutorClass>();
  const [reload, setReload] = useState(0);

  function refresh() {
    setLoading(true);
    setReload((value) => value + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    getTutorClasses({ page, size: PAGE_SIZE, sort: "created_at,desc" }, controller.signal)
      .then((result) => {
        setClasses(result.items);
        setTotalItems(result.total_items);
        setSelectedId((current) => current && result.items.some((item) => item.class_id === current)
          ? current
          : result.items[0]?.class_id);
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(errorText(cause));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, reload]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    getClassDetails(selectedId, controller.signal)
      .then(setSelectedDetails)
      .catch(() => { if (!controller.signal.aborted) setSelectedDetails(undefined); });
    return () => controller.abort();
  }, [selectedId, reload]);

  const visibleClasses = useMemo(() => classes.filter((item) => {
    const query = searchApplied.trim().toLowerCase();
    const matchesQuery = !query || `${item.title} ${item.class_code}`.toLowerCase().includes(query);
    return matchesQuery && (status === "ALL" || item.status === status);
  }), [classes, searchApplied, status]);

  async function submitCreate() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const created = await createTutorClass(values);
      message.success("Class created.");
      setModalOpen(false);
      form.resetFields();
      setPage(1);
      refresh();
      setSelectedId(created.class_id);
    } catch (cause) {
      message.error(errorText(cause));
    } finally { setSaving(false); }
  }

  async function archiveSelected() {
    if (!selectedId) return;
    try {
      await updateTutorClass(selectedId, { status: "ARCHIVED" });
      message.success("Class archived. Membership and learning history are retained.");
      refresh();
    } catch (cause) { message.error(errorText(cause)); }
  }

  return (
    <TutorWorkspaceLayout currentPage="Class Management">
      <main className="tutor-page">
        <div className="tutor-page__heading">
          <div><Typography.Title level={2}>Class Management</Typography.Title><Typography.Paragraph type="secondary">Create and manage your classes, enrollment and learning access.</Typography.Paragraph></div>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Create Class</Button>
        </div>
        <Alert className="tutor-class-info" type="info" showIcon message="Select a class to inspect its details and manage enrollment." />
        {error && <Alert className="tutor-page__notice" type="error" showIcon message="Could not load your classes" description={error} />}
        {loading ? <div className="tutor-page__loading"><Spin /></div> : (
          <div className="tutor-class-grid">
            <section className="tutor-panel">
              <h2>Classes</h2><div className="tutor-panel__sub">Classes owned by your tutor account · {totalItems} total</div>
              <div className="tutor-class-filters">
                <Input prefix={<SearchOutlined />} placeholder="Search title or class code" value={search} onChange={(event) => setSearch(event.target.value)} onPressEnter={() => setSearchApplied(search)} />
                <Select value={status} onChange={(value: "ALL" | "ACTIVE" | "ARCHIVED") => setStatus(value)} options={[{ value: "ALL", label: "All statuses" }, { value: "ACTIVE", label: "Active" }, { value: "ARCHIVED", label: "Archived" }]} />
                <Button type="primary" onClick={() => setSearchApplied(search)}>Search</Button>
              </div>
              {visibleClasses.length === 0 ? <Empty description={error ? "Classes unavailable" : "No classes match your search"} /> : (
                <>
                  <div style={{ overflowX: "auto" }}><table className="tutor-table tutor-class-table"><thead><tr><th>Class / class code</th><th>Enrolled</th><th>Requests</th><th>Status</th></tr></thead><tbody>
                    {visibleClasses.map((item) => <tr key={item.class_id} className={selectedId === item.class_id ? "is-selected" : ""}>
                      <td><button className="tutor-table__select" onClick={() => { setSelectedDetails(undefined); setSelectedId(item.class_id); }}><strong>{item.title}</strong><span>{item.class_code}</span></button></td>
                      <td>{item.status === "ARCHIVED" ? "—" : selectedId === item.class_id && selectedDetails ? `${selectedDetails.active_member_count}/${selectedDetails.max_capacity ?? "∞"}` : "—"}</td>
                      <td>—</td><td><Tag color={item.status === "ACTIVE" ? "green" : "default"}>{item.status}</Tag></td>
                    </tr>)}
                  </tbody></table></div>
                  <Pagination style={{ marginTop: 16, textAlign: "right" }} current={page} pageSize={PAGE_SIZE} total={totalItems} showSizeChanger={false} onChange={(nextPage) => { setLoading(true); setPage(nextPage); }} />
                </>
              )}
            </section>
            <aside className="tutor-panel tutor-selected-class">
              <h2>Selected Class</h2>
              {selectedDetails ? <div className="tutor-class-summary">
                <div><Tag color={selectedDetails.status === "ACTIVE" ? "green" : "default"}>{selectedDetails.status}</Tag></div>
                <div><strong>{selectedDetails.title}</strong></div>
                <div><label>Class code</label><strong>{selectedDetails.class_code}</strong></div>
                <div><label>Enrollment policy</label><strong>{selectedDetails.enrollment_policy}</strong></div>
                <div><label>Capacity</label><strong>{selectedDetails.active_member_count}/{selectedDetails.max_capacity ?? "Unlimited"} seats</strong></div>
                <Link to={`/tutor/classes/${selectedDetails.class_id}`}><Button type="primary" block>Open class details</Button></Link>
                {selectedDetails.status === "ACTIVE" && <Popconfirm title="Archive this class?" description="Membership and learning history are retained; new enrollment is disabled." okText="Archive" cancelText="Cancel" onConfirm={archiveSelected}><Button danger block>Archive class</Button></Popconfirm>}
              </div> : <Empty description="Select a class to inspect its details" />}
            </aside>
          </div>
        )}
        <Modal title="Create Class" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={submitCreate} confirmLoading={saving} okText="Create Class">
          <Form form={form} layout="vertical" initialValues={{ enrollment_policy: "APPROVAL_REQUIRED" }}>
            <Form.Item name="title" label="Title" rules={[{ required: true }, { max: 150 }]}><Input /></Form.Item>
            <Form.Item name="class_code" label="Class Code" rules={[{ required: true }, { min: 3, max: 30 }, { pattern: /^[A-Za-z0-9_-]+$/ }]}><Input /></Form.Item>
            <Form.Item name="description" label="Description" rules={[{ max: 2000 }]}><Input.TextArea rows={3} /></Form.Item>
            <Form.Item name="max_capacity" label="Maximum Capacity"><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="prerequisites_description" label="Prerequisites"><Input /></Form.Item>
            <Form.Item name="enrollment_policy" label="Enrollment Policy" rules={[{ required: true }]}><Select options={[{ value: "OPEN", label: "Open enrollment" }, { value: "APPROVAL_REQUIRED", label: "Approval required" }]} /></Form.Item>
            <Form.Item label="Lifecycle Status"><Tag color="green">ACTIVE</Tag></Form.Item>
            <Typography.Text type="secondary">New classes start as Active. The class code cannot be changed after creation.</Typography.Text>
          </Form>
        </Modal>
      </main>
    </TutorWorkspaceLayout>
  );
}

function errorText(error: unknown) {
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return "The request could not be completed.";
}
