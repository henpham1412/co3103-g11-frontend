import { Button, Space, Typography } from "antd";
import { RocketOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

export default function App() {
  return (
    <main className="app-shell">
      <Typography.Title level={2}>
        CO3103 Group 11
      </Typography.Title>

      <Typography.Paragraph>
        Frontend environment is ready.
      </Typography.Paragraph>

      <Typography.Paragraph>
        Current date: {dayjs().format("DD/MM/YYYY")}
      </Typography.Paragraph>

      <Space>
        <Button type="primary" icon={<RocketOutlined />}>
          Ant Design is ready
        </Button>
      </Space>
    </main>
  );
}