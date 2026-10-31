import type { ReactNode } from "react";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import { Avatar } from "antd";
import { Link, useLocation } from "react-router-dom";

import "./student-workspace-layout.css";

interface StudentWorkspaceLayoutProps {
  children: ReactNode;
  currentPage: string;
}

export default function StudentWorkspaceLayout({
  children,
  currentPage,
}: StudentWorkspaceLayoutProps) {
  const { pathname } = useLocation();
  const navigationItems = [
    { label: "Dashboard", path: "/dashboard", icon: <WorkspaceIcon name="layout-dashboard" /> },
    { label: "Users", path: "/users", icon: <WorkspaceIcon name="users" /> },
    { label: "Classes", path: "/classes", icon: <WorkspaceIcon name="graduation-cap" /> },
    { label: "Basic Reports", path: "/reports", icon: <WorkspaceIcon name="chart-no-axes-column" /> },
    { label: "Discussion", path: "/discussion", icon: <WorkspaceIcon name="message-square" /> },
  ];

  return (
    <div className="student-workspace">
      <aside className="student-workspace__sidebar">
        <div className="student-workspace__brand">
          <span className="student-workspace__brand-icon">
            <WorkspaceIcon name="book-open" size={20} />
          </span>
          <span>G11 LMS</span>
        </div>

        <TypographyLabel>STUDENT</TypographyLabel>

        <nav className="student-workspace__navigation" aria-label="Student navigation">
          {navigationItems.map((item) => (
            <Link
              key={item.path}
              className={`student-workspace__nav-item${pathname.startsWith(item.path) ? " student-workspace__nav-item--active" : ""}`}
              to={item.path}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="student-workspace__footer">
          <strong>Private tutoring workspace</strong>
          <span>Self-hosted learning management</span>
        </div>
      </aside>

      <div className="student-workspace__main">
        <header className="student-workspace__topbar">
          <div className="student-workspace__breadcrumb">
            <span>Student</span>
            <RightOutlined />
            <strong>{currentPage}</strong>
          </div>

          <div className="student-workspace__account">
            <Avatar size={30}>AM</Avatar>
            <span>Alex Morgan - STUDENT</span>
            <DownOutlined />
          </div>
        </header>

        <div className="student-workspace__content">{children}</div>
      </div>
    </div>
  );
}

function TypographyLabel({ children }: { children: ReactNode }) {
  return <div className="student-workspace__section-label">{children}</div>;
}
function WorkspaceIcon({
  name,
  size = 19,
}: {
  name: "layout-dashboard" | "users" | "book-open" | "graduation-cap" | "chart-no-axes-column" | "message-square";
  size?: number;
}) {
  const common = {
    "aria-hidden": true as const,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "layout-dashboard":
      return <svg {...common}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>;
    case "users":
      return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "book-open":
      return <svg {...common}><path d="M12 7v14" /><path d="M3 18V5a2 2 0 0 1 2-2h2a5 5 0 0 1 5 5 5 5 0 0 1 5-5h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-2a5 5 0 0 0-5 2 5 5 0 0 0-5-2H5a2 2 0 0 1-2-2Z" /></svg>;
    case "graduation-cap":
      return (
        <svg {...common}>
          <path d="m2 10 10-5 10 5-10 5-10-5Z" />
          <path d="M6 12v5c3.3 3 8.7 3 12 0v-5" />
          <path d="M22 10v6" />
        </svg>
      );    case "chart-no-axes-column":
      return <svg {...common}><path d="M5 21v-6" /><path d="M12 21V3" /><path d="M19 21v-9" /></svg>;
    case "message-square":
      return <svg {...common}><path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></svg>;
  }
}