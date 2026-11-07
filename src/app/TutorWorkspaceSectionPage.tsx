import { Card, Empty, Typography } from "antd";

import TutorWorkspaceLayout from "../components/layout/TutorWorkspaceLayout";

export default function TutorWorkspaceSectionPage() {
  return (
    <TutorWorkspaceLayout currentPage="Discussion">
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 32 }}>
        <Typography.Title level={2}>Discussion</Typography.Title>
        <Card>
          <Empty description="Discussion page is not implemented yet." />
        </Card>
      </main>
    </TutorWorkspaceLayout>
  );
}
