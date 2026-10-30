import { createBrowserRouter } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";

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
    path: "/",
    element: <App />,
  },
  {
    path: "/login",
    hydrateFallbackElement: authFallback,
    lazy: async () => ({ Component: (await import("@/features/auth/pages/LoginPage")).default }),
  },
  {
    path: "/register",
    hydrateFallbackElement: authFallback,
    lazy: async () => ({ Component: (await import("@/features/auth/pages/RegisterPage")).default }),
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);
