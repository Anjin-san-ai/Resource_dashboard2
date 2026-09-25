import { CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'

const TONES = {
  success: { icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  warning: { icon: AlertTriangle, cls: 'border-amber-200 bg-amber-50 text-amber-800' },
  info: { icon: Info, cls: 'border-brand-200 bg-brand-50 text-brand-800' },
}

export default function Toast() {
  const { toast } = useApp()
  if (!toast) return null
  const { icon: Icon, cls } = TONES[toast.tone] || TONES.success

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[60]">
      <div
        key={toast.key}
        className={`animate-in pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg ${cls}`}
      >
        <Icon size={20} />
        <span className="text-sm font-semibold">{toast.message}</span>
      </div>
    </div>
  )
}
