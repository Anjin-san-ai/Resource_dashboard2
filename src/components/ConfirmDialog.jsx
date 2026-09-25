import { AlertTriangle } from 'lucide-react'
import Modal from './Modal.jsx'

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Delete',
  tone = 'danger',
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <div className="flex gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
            tone === 'danger'
              ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
              : 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300'
          }`}
        >
          <AlertTriangle size={22} />
        </div>
        <p className="pt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{message}</p>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-subtle" onClick={onClose}>
          Cancel
        </button>
        <button
          className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
          onClick={() => {
            onConfirm?.()
            onClose?.()
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
