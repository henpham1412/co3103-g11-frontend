import { Button } from "antd";
import { createBrowserRouter } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { PublicOnlyRoute } from "@/features/auth/components/PublicOnlyRoute";

import App from "./App";
import NotFoundPage from "./NotFoundPage";

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
            path: "/",
            element: <AuthenticatedLayout />,
            children: [{ index: true, element: <App /> }],
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
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);
