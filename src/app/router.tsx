import { Button } from "antd";
import { Navigate, createBrowserRouter } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { PublicOnlyRoute } from "@/features/auth/components/PublicOnlyRoute";

import ClassActivityPage from "../features/classes/pages/ClassActivityPage";
import AssessmentHistoryPage from "../features/classes/pages/AssessmentHistoryPage";
import ClassCatalogPage from "../features/classes/pages/ClassCatalogPage";
import ClassDetailPage from "../features/classes/pages/ClassDetailPage";
import StudentLessonPage from "../features/classes/pages/StudentLessonPage";
import TutorClassDetailPage from "../features/tutor-classes/pages/TutorClassDetailPage";
import TutorClassManagementPage from "../features/tutor-classes/pages/TutorClassManagementPage";
import TutorContentManagementPage from "../features/tutor-classes/pages/TutorContentManagementPage";
import TutorQuizPage from "../features/tutor-classes/pages/TutorQuizPage";
import TutorDashboardPage from "../features/tutor-classes/pages/TutorDashboardPage";
import TutorRoute from "../features/tutor-classes/TutorRoute";
import App from "./App";
import NotFoundPage from "./NotFoundPage";
import TutorWorkspaceSectionPage from "./TutorWorkspaceSectionPage";
import WorkspaceSectionPage from "./WorkspaceSectionPage";

const authFallback = (
  <AuthLayout>
    <h1 id="auth-title" className="auth-title">G11 LMS</h1>
    <p role="status">Loading authentication…</p>
  </AuthLayout>
);

export const router = createBrowserRouter([
  {
    hydrateFallbackElement: authFallback,
    errorElement: (
      <AuthLayout>
        <h1 id="auth-title" className="auth-title">Unable to load this page</h1>
        <p className="auth-subtitle" role="alert">Please reload the page to try again.</p>
        <Button type="primary" onClick={() => window.location.reload()}>Reload page</Button>
      </AuthLayout>
    ),
    children: [
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: "/",
            element: <AuthenticatedLayout />,
            children: [{ index: true, element: <App /> }],
          },
          { path: "/classes", element: <ClassCatalogPage /> },
          { path: "/classes/:classId", element: <ClassDetailPage /> },
          { path: "/classes/:classId/lessons/:lessonId", element: <StudentLessonPage /> },
          {
            path: "/classes/:classId/lessons/:lessonId/activities/:activityId",
            element: <ClassActivityPage />,
          },
          { path: "/assessment-history", element: <AssessmentHistoryPage /> },
          { path: "/dashboard", element: <WorkspaceSectionPage /> },
          { path: "/discussion", element: <WorkspaceSectionPage /> },
          {
            element: <TutorRoute />,
            children: [
              { path: "/tutor", element: <Navigate to="/tutor/dashboard" replace /> },
              { path: "/tutor/dashboard", element: <TutorDashboardPage /> },
              { path: "/tutor/classes", element: <TutorClassManagementPage /> },
              { path: "/tutor/classes/:classId", element: <TutorClassDetailPage /> },
              { path: "/tutor/classes/:classId/content", element: <TutorContentManagementPage /> },
              { path: "/tutor/classes/:classId/content/quiz/new", element: <TutorQuizPage /> },
              { path: "/tutor/classes/:classId/content/quiz/:activityId", element: <TutorQuizPage /> },
              { path: "/tutor/discussion", element: <TutorWorkspaceSectionPage /> },
            ],
          },
        ],
      },
      {
        element: <PublicOnlyRoute />,
        children: [
          {
            path: "/login",
            lazy: async () => ({ Component: (await import("@/features/auth/pages/LoginPage")).default }),
          },
          {
            path: "/register",
            lazy: async () => ({ Component: (await import("@/features/auth/pages/RegisterPage")).default }),
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
