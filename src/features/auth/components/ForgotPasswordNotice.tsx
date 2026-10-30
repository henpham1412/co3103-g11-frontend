import { Button, Modal } from 'antd'

interface ForgotPasswordNoticeProps {
  open: boolean
  onClose: () => void
}

export function ForgotPasswordNotice({ open, onClose }: ForgotPasswordNoticeProps) {
  return (
    <Modal
      title="Password assistance"
      open={open}
      onCancel={onClose}
      centered
      footer={<Button type="primary" onClick={onClose}>Got it</Button>}
    >
      <p>Self-service password reset is not enabled on this internal system.</p>
      <p>Please contact your G11 System Administrator for help resetting your password.</p>
    </Modal>
  )
}
