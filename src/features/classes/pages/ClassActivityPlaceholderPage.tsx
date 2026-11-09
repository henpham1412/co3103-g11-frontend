import { Button, Card, Empty, Typography } from "antd";
import { Link, useParams } from "react-router-dom";

import StudentWorkspaceLayout from "../../../components/layout/StudentWorkspaceLayout";

export default function ClassActivityPlaceholderPage() {
  const { classId = "" } = useParams();

  return (
    <StudentWorkspaceLayout currentPage="Class Catalog > Class Detail > Activity">
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 32 }}>
        <Typography.Title level={2}>Learning activity</Typography.Title>
        <Card>
          <Empty description="The quiz and assignment screens are delivered by FE-6.">
            <Button type="primary">
              <Link to={`/classes/${classId}`}>Back to class</Link>
            </Button>
          </Empty>
        </Card>
      </main>
    </StudentWorkspaceLayout>
  );
}
