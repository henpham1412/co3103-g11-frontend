import type { PropsWithChildren } from "react";
import { ConfigProvider } from "antd";

export default function AppProviders({
  children,
}: PropsWithChildren) {
  return <ConfigProvider>{children}</ConfigProvider>;
}