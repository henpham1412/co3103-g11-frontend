import type { PropsWithChildren } from "react";
import { App, ConfigProvider } from "antd";
import { AuthProvider } from "@/features/auth/context/AuthProvider";
import { AuthSessionState } from "@/features/auth/components/AuthSessionState";
import { authTheme } from "./theme";

export default function AppProviders({
  children,
}: PropsWithChildren) {
  return (
    <ConfigProvider theme={authTheme}>
      <App>
        <AuthProvider>
          <AuthSessionState>{children}</AuthSessionState>
        </AuthProvider>
      </App>
    </ConfigProvider>
  );
}
