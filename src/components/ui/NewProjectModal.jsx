import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, FolderPlus, Sparkles, FileBox } from 'lucide-react'

export default function NewProjectModal({ open, onClose, onCreate, defaultName }) {
  const [name, setName] = useState(defaultName || '')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setName(defaultName || '')
      // Focus after animation
      setTimeout(() => inputRef.current?.focus(), 120)
    }
  }, [open, defaultName])

  const canCreate = name.trim().length > 0

  const handleCreate = () => {
    if (!canCreate) return
    onCreate(name.trim())
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundColor: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(16px)',
            }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="relative flex flex-col rounded-lg overflow-hidden"
            style={{
              width: 'min(92vw, 440px)',
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 80px rgba(168,85,247,0.12), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
            initial={{ scale: 0.94, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onKeyDown={handleKeyDown}
          >
            {/* Accent line */}
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.6), transparent)' }}
            />

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div
                className="flex items-center justify-center rounded-xl"
                style={{
                  width: 36,
                  height: 36,
                  background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.06))',
                  border: '1px solid rgba(168,85,247,0.25)',
                  boxShadow: '0 0 16px rgba(168,85,247,0.15)',
                }}
              >
                <FolderPlus size={16} style={{ color: '#a78bfa' }} strokeWidth={2.2} />
              </div>
              <div className="flex flex-col">
                <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
                  New Project
                </h2>
                <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  Start a fresh mapping workspace
                </span>
              </div>

              <button
                onClick={onClose}
                className="ml-auto flex items-center justify-center rounded-lg cursor-pointer border-none transition-all"
                style={{
                  width: 30,
                  height: 30,
                  backgroundColor: 'transparent',
                  color: 'var(--color-text-secondary)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 flex flex-col gap-3">
              <label className="text-[10.5px] font-medium flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                <FileBox size={10} style={{ opacity: 0.7 }} />
                Project name
              </label>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Customer API Mapping"
                className="w-full px-3.5 py-2.5 rounded-lg text-[13px] font-medium outline-none transition-all"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--color-text-primary)',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(168,85,247,0.5)'
                  e.target.style.backgroundColor = 'rgba(168,85,247,0.04)'
                  e.target.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.08)'
                  e.target.style.backgroundColor = 'rgba(255,255,255,0.03)'
                  e.target.style.boxShadow = 'none'
                }}
              />
              <span className="text-[10.5px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                You can rename this any time from the project selector.
              </span>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 pt-2 flex items-center gap-2.5">
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
                Cancel
              </button>
              <motion.button
                onClick={handleCreate}
                disabled={!canCreate}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:cursor-not-allowed border-none"
                style={{
                  background: canCreate
                    ? 'linear-gradient(135deg, #a855f7, #7c3aed)'
                    : 'rgba(168,85,247,0.15)',
                  color: canCreate ? 'white' : 'rgba(255,255,255,0.3)',
                  boxShadow: canCreate ? '0 4px 16px rgba(168,85,247,0.35)' : 'none',
                  transition: 'all 0.2s',
                }}
                whileHover={canCreate ? { scale: 1.01 } : {}}
                whileTap={canCreate ? { scale: 0.98 } : {}}
              >
                <Sparkles size={13} />
                Create Project
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
