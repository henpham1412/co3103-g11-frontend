import { useEffect, useState } from "react";
import { Alert, Button, Spin } from "antd";
import { Link, Outlet } from "react-router-dom";

import { normalizeApiError } from "@/api/apiError";
import { getTutorClasses } from "./api/tutorClassApi";

import "../../components/layout/tutor-workspace-layout.css";

type Access = "loading" | "allowed" | "denied" | "error";

// DOC-05 puts no LMS role in the token. GET /tutor/classes is the server's tutor
// check, so a student never receives the tutor chrome before that answer.
export default function TutorRoute() {
  const [access, setAccess] = useState<Access>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getTutorClasses({ page: 1, size: 1, sort: "created_at,desc" }, controller.signal)
      .then(() => { if (!controller.signal.aborted) setAccess("allowed"); })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setAccess(normalizeApiError(cause).status === 403 ? "denied" : "error");
      });
    return () => controller.abort();
  }, [attempt]);

  if (access === "loading") {
    return <main className="tutor-page"><div className="tutor-page__loading" role="status"><Spin /></div></main>;
  }

  if (access === "denied") {
    return (
      <main className="tutor-page">
        <Alert
          type="warning"
          showIcon
          title="Tutor workspace is not available to your account"
          description="The LMS did not grant this account the tutor role, so class management stays closed."
          action={<Link to="/classes">Back to classes</Link>}
        />
      </main>
    );
  }

  if (access === "error") {
    return (
      <main className="tutor-page">
        <Alert
          type="error"
          showIcon
          title="Could not check tutor access"
          description="The class list did not answer, so the tutor workspace stays closed."
          action={<Button onClick={() => { setAccess("loading"); setAttempt((value) => value + 1); }}>Try again</Button>}
        />
      </main>
    );
  }

  return <Outlet />;
}
