import type { ReactNode } from "react";
import {
  AppstoreOutlined,
  BarChartOutlined,
  BookOutlined,
  DownOutlined,
  MessageOutlined,
  ReadOutlined,
  RightOutlined,
  TeamOutlined,
} from "@ant-design/icons";
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
    { label: "Dashboard", path: "/dashboard", icon: <AppstoreOutlined /> },
    { label: "Users", path: "/users", icon: <TeamOutlined /> },
    { label: "Classes", path: "/classes", icon: <ReadOutlined /> },
    { label: "Basic Reports", path: "/reports", icon: <BarChartOutlined /> },
    { label: "Discussion", path: "/discussion", icon: <MessageOutlined /> },
  ];

  return (
    <div className="student-workspace">
      <aside className="student-workspace__sidebar">
        <div className="student-workspace__brand">
          <span className="student-workspace__brand-icon">
            <BookOutlined />
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
