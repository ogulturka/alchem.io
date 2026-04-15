import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle } from 'lucide-react'

/**
 * Generic confirmation dialog — destructive by default (red accent).
 * Pass variant="neutral" for non-destructive confirmations.
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  description = '',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  icon: Icon = AlertTriangle,
  variant = 'danger', // 'danger' | 'neutral'
}) {
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'Enter') { onConfirm(); onClose() }
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onConfirm, onClose])

  const isDanger = variant === 'danger'
  const accent = isDanger ? '#ef4444' : '#a78bfa'
  const accentRgb = isDanger ? '239,68,68' : '168,85,247'
  const gradient = isDanger
    ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
    : 'linear-gradient(135deg, #a855f7, #7c3aed)'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundColor: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(16px)',
            }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="relative flex flex-col rounded-lg overflow-hidden"
            style={{
              width: 'min(92vw, 420px)',
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: `0 24px 60px rgba(0,0,0,0.6), 0 0 80px rgba(${accentRgb},0.12), inset 0 1px 0 rgba(255,255,255,0.04)`,
            }}
            initial={{ scale: 0.94, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            {/* Accent line */}
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{ background: `linear-gradient(90deg, transparent, rgba(${accentRgb},0.6), transparent)` }}
            />

            {/* Close button (top-right) */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 flex items-center justify-center rounded-lg cursor-pointer border-none transition-all"
              style={{
                width: 28,
                height: 28,
                backgroundColor: 'transparent',
                color: 'var(--color-text-secondary)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
            >
              <X size={15} />
            </button>

            {/* Body */}
            <div className="p-6 flex flex-col items-center text-center gap-3">
              <div
                className="flex items-center justify-center rounded-full mb-1"
                style={{
                  width: 52,
                  height: 52,
                  background: `linear-gradient(135deg, rgba(${accentRgb},0.2), rgba(${accentRgb},0.05))`,
                  border: `1px solid rgba(${accentRgb},0.3)`,
                  boxShadow: `0 0 24px rgba(${accentRgb},0.2)`,
                }}
              >
                <Icon size={22} style={{ color: accent }} strokeWidth={2.2} />
              </div>

              <h2 className="text-[16px] font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
                {title}
              </h2>
              {description && (
                <p className="text-[12.5px] leading-relaxed max-w-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {description}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 flex items-center gap-2.5">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold cursor-pointer transition-all border-none"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  color: 'var(--color-text-secondary)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              >
                {cancelLabel}
              </button>
              <motion.button
                onClick={() => { onConfirm(); onClose() }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12px] font-semibold text-white cursor-pointer border-none"
                style={{
                  background: gradient,
                  boxShadow: `0 4px 16px rgba(${accentRgb},0.35)`,
                }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                {confirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
