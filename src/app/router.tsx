import { Button } from "antd";
import { Navigate, createBrowserRouter, matchRoutes } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { PublicOnlyRoute } from "@/features/auth/components/PublicOnlyRoute";
import AdminRoute from "@/features/admin/AdminRoute";
import AdminWorkspaceLayout from "@/features/admin/AdminWorkspaceLayout";
import AdminUsersPage from "@/features/admin/pages/AdminUsersPage";
import AdminContentReportsPage from "@/features/admin/pages/AdminContentReportsPage";
import AdminReportsPage from "@/features/admin/pages/AdminReportsPage";
import AdminAuditLogsPage from "@/features/admin/pages/AdminAuditLogsPage";

import ClassActivityPage from "../features/classes/pages/ClassActivityPage";
import AssessmentHistoryPage from "../features/classes/pages/AssessmentHistoryPage";
import ClassCatalogPage from "../features/classes/pages/ClassCatalogPage";
import ClassDetailPage from "../features/classes/pages/ClassDetailPage";
import ClassProgressPage from "../features/classes/pages/ClassProgressPage";
import StudentLessonPage from "../features/classes/pages/StudentLessonPage";
import DiscussionBoardPage from "../features/discussions/pages/DiscussionBoardPage";
import DiscussionHubPage from "../features/discussions/pages/DiscussionHubPage";
import DiscussionThreadPage from "../features/discussions/pages/DiscussionThreadPage";
import NotificationsPage from "../features/notifications/pages/NotificationsPage";
import TutorClassDetailPage from "../features/tutor-classes/pages/TutorClassDetailPage";
import TutorClassManagementPage from "../features/tutor-classes/pages/TutorClassManagementPage";
import TutorContentManagementPage from "../features/tutor-classes/pages/TutorContentManagementPage";
import TutorQuizPage from "../features/tutor-classes/pages/TutorQuizPage";
import TutorAssignmentPage from "../features/tutor-classes/pages/TutorAssignmentPage";
import TutorAssignmentGradingPage from "../features/tutor-classes/pages/TutorAssignmentGradingPage";
import TutorDashboardPage from "../features/tutor-classes/pages/TutorDashboardPage";
import TutorRoute from "../features/tutor-classes/TutorRoute";
import App from "./App";
import NotFoundPage from "./NotFoundPage";
import WorkspaceSectionPage from "./WorkspaceSectionPage";

export function hasAppRoute(path: string): boolean {
  const matches = matchRoutes(router.routes, path);
  return Boolean(
    matches &&
      matches.length > 0 &&
      matches.every((match) => match.route.path !== "*" && !match.route.path?.endsWith("/*")),
  );
}

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
        path: '/reset-password',
        lazy: async () => ({ Component: (await import('@/features/auth/pages/ResetPasswordPage')).default }),
      },
      {
        path: '/forgot-password',
        lazy: async () => ({ Component: (await import('@/features/auth/pages/ForgotPasswordPage')).default }),
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AdminRoute />,
            children: [{
              path: '/admin',
              element: <AdminWorkspaceLayout />,
              children: [
                { index: true, element: <Navigate to="/admin/users" replace /> },
                { path: 'users', element: <AdminUsersPage /> },
                { path: 'content-reports', element: <AdminContentReportsPage /> },
                { path: 'reports', element: <AdminReportsPage /> },
                { path: 'audit-logs', element: <AdminAuditLogsPage /> },
              ],
            }],
          },
          {
            path: "/",
            element: <AuthenticatedLayout />,
            children: [
              { index: true, element: <App /> },
              { path: 'profile', lazy: async () => ({ Component: (await import('@/features/profile/pages/ProfilePage')).default }) },
            ],
          },
          { path: "/classes", element: <ClassCatalogPage /> },
          { path: "/classes/:classId", element: <ClassDetailPage /> },
          { path: "/classes/:classId/progress", element: <ClassProgressPage /> },
          { path: "/classes/:classId/discussions", element: <DiscussionBoardPage variant="student" /> },
          {
            path: "/classes/:classId/discussions/:discussionId",
            element: <DiscussionThreadPage variant="student" />,
          },
          { path: "/classes/:classId/lessons/:lessonId", element: <StudentLessonPage /> },
          {
            path: "/classes/:classId/lessons/:lessonId/activities/:activityId",
            element: <ClassActivityPage />,
          },
          { path: "/assessment-history", element: <AssessmentHistoryPage /> },
          { path: "/dashboard", element: <WorkspaceSectionPage /> },
          { path: "/discussion", element: <DiscussionHubPage variant="student" /> },
          { path: "/notifications", element: <NotificationsPage variant="student" isRouteAvailable={hasAppRoute} /> },
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
              { path: "/tutor/classes/:classId/content/assignment/new", element: <TutorAssignmentPage /> },
              { path: "/tutor/classes/:classId/content/assignment/:activityId", element: <TutorAssignmentPage /> },
              { path: "/tutor/classes/:classId/content/assignment/:activityId/grade", element: <TutorAssignmentGradingPage /> },
              { path: "/tutor/discussion", element: <DiscussionHubPage variant="tutor" /> },
              { path: "/tutor/notifications", element: <NotificationsPage variant="tutor" isRouteAvailable={hasAppRoute} /> },
              { path: "/tutor/classes/:classId/discussions", element: <DiscussionBoardPage variant="tutor" /> },
              {
                path: "/tutor/classes/:classId/discussions/:discussionId",
                element: <DiscussionThreadPage variant="tutor" />,
              },
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
