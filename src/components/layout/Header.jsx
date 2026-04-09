import { useState } from 'react'
import { FlaskConical, Trash2, Braces } from 'lucide-react'
import ThemeSwitcher from '../ui/ThemeSwitcher'
import UdfManagerModal from '../ui/UdfManagerModal'
import useAppStore from '../../store/useAppStore'

export default function Header() {
  const clearMappings = useAppStore((s) => s.clearMappings)
  const udfCount = useAppStore((s) => s.udfs.length)
  const [udfOpen, setUdfOpen] = useState(false)

  return (
    <header className="h-16 flex-shrink-0 flex items-center justify-between px-8 bg-bg-secondary border-b border-border">
      <div className="flex items-center gap-3">
        <FlaskConical size={24} className="text-accent" />
        <h1 className="text-xl font-bold bg-gradient-to-r from-accent to-accent-glow bg-clip-text text-transparent">
          Alchem.io
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setUdfOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider cursor-pointer transition-all duration-200"
          style={{
            backgroundColor: 'rgba(168,85,247,0.08)',
            border: '1px solid rgba(168,85,247,0.2)',
            color: 'var(--color-accent)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(168,85,247,0.15)'
            e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'
            e.currentTarget.style.boxShadow = '0 0 12px rgba(168,85,247,0.2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(168,85,247,0.08)'
            e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <Braces size={13} />
          UDF Library
          {udfCount > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(168,85,247,0.2)' }}>{udfCount}</span>
          )}
        </button>
        <button
          onClick={clearMappings}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider cursor-pointer transition-all duration-200"
          style={{
            backgroundColor: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#ef4444',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)'
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'
            e.currentTarget.style.boxShadow = '0 0 12px rgba(239,68,68,0.2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)'
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <Trash2 size={13} />
          Clear Mappings
        </button>
        <ThemeSwitcher />
      </div>
      <UdfManagerModal open={udfOpen} onClose={() => setUdfOpen(false)} />
    </header>
  )
}
