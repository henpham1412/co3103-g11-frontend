import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Spin, Statistic, Typography } from "antd";
import { Link } from "react-router-dom";
import TutorWorkspaceLayout from "../../../components/layout/TutorWorkspaceLayout";
import { normalizeApiError } from "@/api/apiError";
import { getTutorClasses } from "../api/tutorClassApi";
import type { TutorClass } from "../types";
import { tutorErrorText } from "../utils/tutorErrorText";

export default function TutorDashboardPage() {
  const [classes, setClasses] = useState<TutorClass[]>([]);
  const [totalClasses, setTotalClasses] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getTutorClasses({ page: 1, size: 100, sort: "created_at,desc" }, controller.signal)
      .then(async (firstPage) => {
        const laterPages = await Promise.all(Array.from({ length: Math.max(0, firstPage.total_pages - 1) }, (_, index) =>
          getTutorClasses({ page: index + 2, size: 100, sort: "created_at,desc" }, controller.signal)));
        setClasses([ ...firstPage.items, ...laterPages.flatMap((page) => page.items) ]);
        setTotalClasses(firstPage.total_items);
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
  }, []);

  const summary = useMemo(() => ({
    active: classes.filter((item) => item.status === "ACTIVE").length,
    archived: classes.filter((item) => item.status === "ARCHIVED").length,
  }), [classes]);
  const activeClasses = classes.filter((item) => item.status === "ACTIVE");

  return (
    <TutorWorkspaceLayout currentPage="Dashboard">
      <main className="tutor-page tutor-dashboard">
        <div className="tutor-page__heading"><div><Typography.Title level={2}>Tutor Dashboard</Typography.Title><Typography.Paragraph type="secondary">Review your classes and continue preparing course content.</Typography.Paragraph></div></div>
        {permissionDenied ? (
          <Alert type="warning" showIcon title="Tutor workspace is not available to your account" description="The LMS refused the tutor class list, so no metrics or class shortcuts are shown." />
        ) : error ? (
          <Alert type="error" showIcon title="Could not load your dashboard" description={error} />
        ) : null}
        {loading ? <div className="tutor-page__loading"><Spin /></div> : !permissionDenied && <>
          <section className="tutor-dashboard__metrics">
            <div className="tutor-panel"><Statistic title="Active Classes" value={summary.active} /><span>{summary.archived} archived · {totalClasses} total classes</span></div>
            <div className="tutor-panel"><Statistic title="Enrolled Students" value="—" /><span>The class-list API does not include enrollment totals.</span></div>
            <div className="tutor-panel"><Statistic title="Pending Requests" value="—" /><span>Open a class to review its requests</span></div>
          </section>
          <section className="tutor-panel tutor-dashboard__activity">
            <div><Typography.Title level={4}>Recent Class Activity</Typography.Title><Typography.Text type="secondary">Latest updates from your classes</Typography.Text></div>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="The current API does not provide an activity feed." />
          </section>
          <section className="tutor-dashboard__bottom">
            <div className="tutor-panel"><Typography.Title level={4}>Your teaching workspace</Typography.Title><Typography.Text type="secondary">{summary.active} active classes</Typography.Text><div className="tutor-dashboard__class-links">{activeClasses.length ? activeClasses.slice(0, 3).map((item) => <Link key={item.class_id} to={`/tutor/classes/${item.class_id}`}><strong>{item.title}</strong><span>{item.class_code}</span><span>{item.enrollment_policy}</span></Link>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No active classes" />}</div></div>
            <div className="tutor-panel"><Typography.Title level={4}>Continue editing</Typography.Title><Typography.Text type="secondary">Open a class to manage its chapters, lessons and materials.</Typography.Text>{activeClasses[0] ? <div className="tutor-dashboard__continue"><strong>{activeClasses[0].title}</strong><span>{activeClasses[0].class_code}</span><Link to={`/tutor/classes/${activeClasses[0].class_id}/content`}><Button type="primary" block>Manage content</Button></Link></div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Create a class to get started" />}</div>
          </section>
        </>}
      </main>
    </TutorWorkspaceLayout>
  );
}
