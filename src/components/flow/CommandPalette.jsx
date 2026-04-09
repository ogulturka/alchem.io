import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Merge, CaseSensitive, Calendar, Hash, GitBranch, Replace, X,
  Calculator, Scissors, Equal, Braces,
} from 'lucide-react'
import useAppStore from '../../store/useAppStore'

const categoryGroups = [
  {
    label: 'String',
    color: 'var(--color-cat-string)',
    glow: 'var(--color-cat-string-glow)',
    items: [
      { operation: 'concat', label: 'Concat', icon: Merge, desc: 'Join two values' },
      { operation: 'uppercase', label: 'UpperCase', icon: CaseSensitive, desc: 'Convert to uppercase' },
      { operation: 'replace', label: 'Replace', icon: Replace, desc: 'Find and replace text' },
      { operation: 'substring', label: 'Substring', icon: Scissors, desc: 'Extract part of text' },
    ],
  },
  {
    label: 'Logic',
    color: 'var(--color-cat-logic)',
    glow: 'var(--color-cat-logic-glow)',
    items: [
      { operation: 'ifelse', label: 'IfElse', icon: GitBranch, desc: 'Conditional branch' },
      { operation: 'equals', label: 'Equals', icon: Equal, desc: 'Compare two values' },
    ],
  },
  {
    label: 'Data',
    color: 'var(--color-cat-data)',
    glow: 'var(--color-cat-data-glow)',
    items: [
      { operation: 'constant', label: 'Constant', icon: Hash, desc: 'Hardcoded value' },
      { operation: 'formatDate', label: 'FormatDate', icon: Calendar, desc: 'Format date string' },
      { operation: 'math', label: 'Math', icon: Calculator, desc: 'Arithmetic operation' },
    ],
  },
]

export default function CommandPalette({ open, position, onSelect, onClose }) {
  const ref = useRef(null)
  const udfs = useAppStore((s) => s.udfs)

  useEffect(() => {
    if (!open) return
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    window.addEventListener('keydown', handleKey)
    window.addEventListener('mousedown', handleClick, true)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('mousedown', handleClick, true)
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          className="fixed z-[100] rounded-xl border shadow-2xl overflow-hidden backdrop-blur-xl"
          style={{
            left: position.x,
            top: position.y,
            backgroundColor: 'color-mix(in srgb, var(--color-bg-secondary) 92%, transparent)',
            borderColor: 'var(--color-border)',
            minWidth: 220,
          }}
          initial={{ opacity: 0, scale: 0.9, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -8 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
              Add Transform
            </span>
            <button
              onClick={onClose}
              className="flex items-center justify-center rounded-md hover:bg-white/5 transition-colors"
              style={{ width: 20, height: 20 }}
            >
              <X size={10} style={{ color: 'var(--color-text-secondary)' }} />
            </button>
          </div>

          {/* Groups */}
          <div className="py-1">
            {categoryGroups.map((group, gi) => (
              <div key={group.label}>
                {/* Category label */}
                <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
                  <div className="rounded-full" style={{ width: 6, height: 6, backgroundColor: group.color, boxShadow: `0 0 6px ${group.glow}` }} />
                  <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: group.color }}>
                    {group.label}
                  </span>
                </div>

                {/* Items */}
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <motion.button
                      key={item.operation}
                      className="w-full flex items-center gap-2.5 px-3 py-[6px] text-left transition-colors"
                      style={{ color: 'var(--color-text-primary)' }}
                      onClick={() => onSelect(item.operation)}
                      whileHover={{
                        backgroundColor: `color-mix(in srgb, ${group.color} 12%, transparent)`,
                      }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div
                        className="flex items-center justify-center rounded-lg"
                        style={{
                          width: 26,
                          height: 26,
                          backgroundColor: `color-mix(in srgb, ${group.color} 15%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${group.color} 30%, transparent)`,
                        }}
                      >
                        <Icon size={12} style={{ color: group.glow }} strokeWidth={2.5} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-semibold">{item.label}</span>
                        <span className="text-[8px]" style={{ color: 'var(--color-text-secondary)' }}>{item.desc}</span>
                      </div>
                    </motion.button>
                  )
                })}

                {/* Divider between groups */}
                {gi < categoryGroups.length - 1 && (
                  <div className="mx-3 my-1" style={{ height: 1, backgroundColor: 'var(--color-border)', opacity: 0.4 }} />
                )}
              </div>
            ))}
            {/* UDF Section */}
            {udfs.length > 0 && (
              <div>
                <div className="mx-3 my-1" style={{ height: 1, backgroundColor: 'var(--color-border)', opacity: 0.4 }} />
                <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
                  <div className="rounded-full" style={{ width: 6, height: 6, backgroundColor: 'var(--color-cat-logic)', boxShadow: '0 0 6px var(--color-cat-logic-glow)' }} />
                  <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-cat-logic)' }}>
                    Custom UDFs
                  </span>
                </div>
                {udfs.map((udf) => (
                  <motion.button
                    key={udf.id}
                    className="w-full flex items-center gap-2.5 px-3 py-[6px] text-left transition-colors"
                    style={{ color: 'var(--color-text-primary)' }}
                    onClick={() => onSelect(null, udf)}
                    whileHover={{ backgroundColor: 'color-mix(in srgb, var(--color-cat-logic) 12%, transparent)' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-center justify-center rounded-lg" style={{ width: 26, height: 26, backgroundColor: 'color-mix(in srgb, var(--color-cat-logic) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--color-cat-logic) 30%, transparent)' }}>
                      <Braces size={12} style={{ color: 'var(--color-cat-logic-glow)' }} strokeWidth={2.5} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-semibold">{udf.name}</span>
                      <span className="text-[8px]" style={{ color: 'var(--color-text-secondary)' }}>({udf.args.join(', ')})</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
