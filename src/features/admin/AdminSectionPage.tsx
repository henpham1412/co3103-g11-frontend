import { Alert } from 'antd'

/** Route foundation only. Functional screens are delivered in the separately authorized steps. */
export default function AdminSectionPage({ title }: { title: string }) {
  return <section className="tutor-page"><h1>{title}</h1><Alert type="info" showIcon title="This section is not available yet." /></section>
}
