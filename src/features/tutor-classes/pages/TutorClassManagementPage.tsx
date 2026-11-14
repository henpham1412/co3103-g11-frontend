import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Empty, Form, Input, InputNumber, Modal, Pagination, Popconfirm, Select, Spin, Tag, Typography } from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import TutorWorkspaceLayout from "../../../components/layout/TutorWorkspaceLayout";
import { getClassDetails } from "../../classes/api/classApi";
import type { ClassCatalogItem } from "../../classes/types";
import { createTutorClass, getTutorClassMembers, getTutorClasses, updateTutorClass } from "../api/tutorClassApi";
import { normalizeApiError } from "@/api/apiError";
import type { CreateTutorClass, TutorClass } from "../types";
import { isStaleTutorState, tutorErrorText } from "../utils/tutorErrorText";
import { lastValidPage } from "../utils/pagination";

const PAGE_SIZE = 20;
// GET /tutor/classes has no search or status parameter (DOC-05 §3.1.1). The largest
// page the API accepts is 100, so the screen loads every page and filters locally.
const FETCH_SIZE = 100;

function validateClassCode(_: unknown, value: string) {
  const code = value?.trim() ?? "";
  if (!code) return Promise.reject(new Error("Enter a class code"));
  if (code.length < 3 || code.length > 30 || !/^[A-Za-z0-9_-]+$/.test(code)) {
    return Promise.reject(new Error("Use 3–30 letters, numbers, underscores or hyphens"));
  }
  return Promise.resolve();
}

function normalizedClass(values: CreateTutorClass): CreateTutorClass {
  return {
    title: values.title.trim(),
    class_code: values.class_code.trim(),
    description: values.description?.trim() || undefined,
    prerequisites_description: values.prerequisites_description?.trim() || undefined,
    max_capacity: values.max_capacity ?? undefined,
    enrollment_policy: values.enrollment_policy,
  };
}

export default function TutorClassManagementPage() {
  const { message } = App.useApp();
  const [classes, setClasses] = useState<TutorClass[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedDetails, setSelectedDetails] = useState<ClassCatalogItem>();
  const [pendingCount, setPendingCount] = useState<{ classId: string; total: number }>();
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "ARCHIVED">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [permissionDenied, setPermissionDenied] = useState(false);
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
    getTutorClasses({ page: 1, size: FETCH_SIZE, sort: "created_at,desc" }, controller.signal)
      .then(async (first) => {
        const rest = await Promise.all(Array.from({ length: Math.max(0, first.total_pages - 1) }, (_, index) =>
          getTutorClasses({ page: index + 2, size: FETCH_SIZE, sort: "created_at,desc" }, controller.signal)));
        if (controller.signal.aborted) return;
        const items = [first.items, ...rest.map((result) => result.items)].flat();
        setClasses(items);
        setTotalItems(first.total_items);
        setSelectedId((current) => current && items.some((item) => item.class_id === current)
          ? current
          : items[0]?.class_id);
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
  }, [reload]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    const classId = selectedId;
    getClassDetails(classId, controller.signal)
      .then(setSelectedDetails)
      .catch(() => { if (!controller.signal.aborted) setSelectedDetails(undefined); });
    getTutorClassMembers(classId, { status: "PENDING", page: 1, size: 1 }, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setPendingCount({ classId, total: result.total_items }); })
      .catch(() => { if (!controller.signal.aborted) setPendingCount(undefined); });
    return () => controller.abort();
  }, [selectedId, reload]);

  const filteredClasses = useMemo(() => classes.filter((item) => {
    const query = searchApplied.trim().toLowerCase();
    const matchesQuery = !query || `${item.title} ${item.class_code}`.toLowerCase().includes(query);
    return matchesQuery && (status === "ALL" || item.status === status);
  }), [classes, searchApplied, status]);
  // All server pages have already been loaded. Recover the local display page
  // from that authoritative snapshot without fetching the same data twice.
  const currentPage = lastValidPage(page, Math.ceil(filteredClasses.length / PAGE_SIZE));
  if (page !== currentPage) setPage(currentPage);
  const visibleClasses = filteredClasses.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function submitCreate() {
    const values = await form.validateFields().catch(() => undefined);
    if (!values) return;
    setSaving(true);
    try {
      const created = await createTutorClass(normalizedClass(values));
      message.success("Class created.");
      setModalOpen(false);
      form.resetFields();
      setPage(1);
      refresh();
      setSelectedId(created.class_id);
    } catch (cause) {
      message.error(tutorErrorText(cause));
      if (isStaleTutorState(cause)) refresh();
    } finally { setSaving(false); }
  }

  async function archiveSelected() {
    if (!selectedId) return;
    try {
      await updateTutorClass(selectedId, { status: "ARCHIVED" });
      message.success("Class archived. Membership and learning history are retained.");
      refresh();
    } catch (cause) {
      message.error(tutorErrorText(cause));
      if (isStaleTutorState(cause)) refresh();
    }
  }

  return (
    <TutorWorkspaceLayout currentPage="Class Management">
      <main className="tutor-page">
        <div className="tutor-page__heading">
          <div><Typography.Title level={2}>Class Management</Typography.Title><Typography.Paragraph type="secondary">Create and manage your classes, enrollment and learning access.</Typography.Paragraph></div>
          {!permissionDenied && <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Create Class</Button>}
        </div>
        <Alert className="tutor-class-info" type="info" showIcon title="Select a class to inspect its details and manage enrollment." />
        {permissionDenied ? (
          <Alert
            className="tutor-page__notice"
            type="warning"
            showIcon
            title="Tutor class management is not available to your account"
            description="The LMS refused /tutor/classes, so no class list or create action is shown. Sign in with an account that has the tutor role."
          />
        ) : error ? (
          <Alert className="tutor-page__notice" type="error" showIcon title="Could not load your classes" description={error} />
        ) : null}
        {loading ? <div className="tutor-page__loading"><Spin /></div> : (
          <div className="tutor-class-grid">
            <section className="tutor-panel">
              <h2>Classes</h2><div className="tutor-panel__sub">Classes owned by your tutor account · {filteredClasses.length} shown · {totalItems} total. Title, class code and status are filtered here because the class list has no search parameter.</div>
              <div className="tutor-class-filters">
                <Input prefix={<SearchOutlined />} placeholder="Search title or class code" value={search} onChange={(event) => setSearch(event.target.value)} onPressEnter={() => { setPage(1); setSearchApplied(search); }} />
                <Select value={status} onChange={(value: "ALL" | "ACTIVE" | "ARCHIVED") => { setPage(1); setStatus(value); }} options={[{ value: "ALL", label: "All statuses" }, { value: "ACTIVE", label: "Active" }, { value: "ARCHIVED", label: "Archived" }]} />
                <Button type="primary" onClick={() => { setPage(1); setSearchApplied(search); }}>Search</Button>
              </div>
              {visibleClasses.length === 0 ? <Empty description={error ? "Classes unavailable" : "No classes match your search"} /> : (
                <>
                  <div style={{ overflowX: "auto" }}><table className="tutor-table tutor-class-table"><thead><tr><th>Class / class code</th><th>Enrolled</th><th>Requests</th><th>Status</th></tr></thead><tbody>
                    {visibleClasses.map((item) => <tr key={item.class_id} className={selectedId === item.class_id ? "is-selected" : ""}>
                      <td><button className="tutor-table__select" onClick={() => { setSelectedDetails(undefined); setSelectedId(item.class_id); }}><strong>{item.title}</strong><span>{item.class_code}</span></button></td>
                      <td>{item.status === "ARCHIVED" ? "—" : selectedId === item.class_id && selectedDetails ? `${selectedDetails.active_member_count}/${selectedDetails.max_capacity ?? "∞"}` : "—"}</td>
                      <td>{pendingCount?.classId === item.class_id ? pendingCount.total : "—"}</td><td><Tag color={item.status === "ACTIVE" ? "green" : "default"}>{item.status}</Tag></td>
                    </tr>)}
                  </tbody></table></div>
                  <Pagination style={{ marginTop: 16, textAlign: "right" }} current={currentPage} pageSize={PAGE_SIZE} total={filteredClasses.length} showSizeChanger={false} onChange={setPage} />
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
            <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true }, { max: 150 }]}><Input /></Form.Item>
            <Form.Item name="class_code" label="Class Code" rules={[{ validator: validateClassCode }]}><Input /></Form.Item>
            <Form.Item name="description" label="Description" rules={[{ max: 2000 }]}><Input.TextArea rows={3} /></Form.Item>
            <Form.Item name="max_capacity" label="Maximum Capacity"><InputNumber min={1} precision={0} style={{ width: "100%" }} /></Form.Item>
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
