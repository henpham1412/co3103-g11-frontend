import { Card, Empty, Typography } from "antd";
import { useLocation } from "react-router-dom";

import StudentWorkspaceLayout from "../components/layout/StudentWorkspaceLayout";

const sections: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/users": "Users",
  "/reports": "Basic Reports",
  "/discussion": "Discussion",
};

export default function WorkspaceSectionPage() {
  const { pathname } = useLocation();
  const section = sections[pathname] ?? "Workspace";

  return (
    <StudentWorkspaceLayout currentPage={section}>
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 32 }}>
        <Typography.Title level={2}>{section}</Typography.Title>
        <Card>
          <Empty description={`${section} page is not implemented yet.`} />
        </Card>
      </main>
    </StudentWorkspaceLayout>
  );
}
