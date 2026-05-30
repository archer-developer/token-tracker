import { useTranslation } from 'react-i18next'
import { Modal } from './Modal'
import { Button } from './Button'

interface Props {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

export function ConfirmDialog({ open, title, message, onConfirm, onCancel, danger }: Props) {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-700 dark:text-gray-300">{message}</p>
    </Modal>
  )
}
