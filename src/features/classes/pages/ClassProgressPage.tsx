import { Link, useParams } from "react-router-dom";
import { ArrowLeftOutlined } from "@ant-design/icons";
import StudentWorkspaceLayout from "../../../components/layout/StudentWorkspaceLayout";
import ClassProgressPanel from "../components/ClassProgressPanel";
import "../class-detail.css";

export default function ClassProgressPage() {
  const { classId = "" } = useParams();
  return (
    <StudentWorkspaceLayout currentPage="Class Catalog > Learning Progress">
      <main className="class-detail-page">
        <Link className="class-detail__back" to={`/classes/${classId}`}><ArrowLeftOutlined /> Back to class</Link>
        <h1>Learning progress</h1>
        <ClassProgressPanel classId={classId} />
      </main>
    </StudentWorkspaceLayout>
  );
}
