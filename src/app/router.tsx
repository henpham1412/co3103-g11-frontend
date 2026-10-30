import { createBrowserRouter } from "react-router-dom";

import ClassCatalogPage from "../features/classes/pages/ClassCatalogPage";
import ClassDetailPage from "../features/classes/pages/ClassDetailPage";
import App from "./App";
import NotFoundPage from "./NotFoundPage";
import WorkspaceSectionPage from "./WorkspaceSectionPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  },
  {
    path: "/classes",
    element: <ClassCatalogPage />,
  },
  {
    path: "/classes/:classId",
    element: <ClassDetailPage />,
  },
  {
    path: "/dashboard",
    element: <WorkspaceSectionPage />,
  },
  {
    path: "/users",
    element: <WorkspaceSectionPage />,
  },
  {
    path: "/reports",
    element: <WorkspaceSectionPage />,
  },
  {
    path: "/discussion",
    element: <WorkspaceSectionPage />,
  },
  {
    path: "*",
    element: <NotFoundPage />,
  },
]);
