import { motion } from 'framer-motion'
import { Merge, CaseSensitive, Calendar, Wrench } from 'lucide-react'

const tools = [
  { operation: 'concat', label: 'Concat', icon: Merge },
  { operation: 'uppercase', label: 'UpperCase', icon: CaseSensitive },
  { operation: 'formatDate', label: 'FormatDate', icon: Calendar },
]

export default function Toolbox() {
  const onDragStart = (event, operation) => {
    event.dataTransfer.setData('application/reactflow-operation', operation)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <motion.div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-2 py-1.5 rounded-xl border shadow-2xl backdrop-blur-md"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-bg-secondary) 85%, transparent)',
        borderColor: 'var(--color-border)',
      }}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <div className="flex items-center gap-1.5 px-2 border-r" style={{ borderColor: 'var(--color-border)' }}>
        <Wrench size={12} style={{ color: 'var(--color-accent)' }} />
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
          Transforms
        </span>
      </div>

      {tools.map((tool) => {
        const Icon = tool.icon
        return (
          <motion.div
            key={tool.operation}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-grab active:cursor-grabbing select-none border"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              borderColor: 'var(--color-border)',
            }}
            draggable
            onDragStart={(e) => onDragStart(e, tool.operation)}
            whileHover={{
              scale: 1.05,
              borderColor: 'var(--color-accent)',
              boxShadow: '0 0 10px var(--color-accent-glow)',
            }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <Icon size={12} style={{ color: 'var(--color-accent)' }} />
            <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-primary)' }}>
              {tool.label}
            </span>
          </motion.div>
        )
      })}
    </motion.div>
  )
}
