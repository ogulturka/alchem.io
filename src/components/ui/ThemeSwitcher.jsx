import { motion } from 'framer-motion'
import { Moon, Sun, Waves } from 'lucide-react'
import useAppStore from '../../store/useAppStore'

const themes = [
  { id: 'carbon', label: 'Carbon', icon: Moon },
  { id: 'stark', label: 'Stark', icon: Sun },
  { id: 'oceanic', label: 'Oceanic', icon: Waves },
]

export default function ThemeSwitcher() {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)

  return (
    <div
      className="flex items-center rounded-full p-1"
      style={{
        backgroundColor: 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)',
      }}
    >
      {themes.map((t) => {
        const Icon = t.icon
        const isActive = theme === t.id
        return (
          <motion.button
            key={t.id}
            onClick={() => setTheme(t.id)}
            title={t.label}
            className="relative flex items-center justify-center rounded-full cursor-pointer border-none"
            style={{
              width: 28,
              height: 28,
              backgroundColor: 'transparent',
              color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              transition: 'color 0.18s',
            }}
            whileTap={{ scale: 0.92 }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = 'var(--color-text-primary)'
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = 'var(--color-text-secondary)'
            }}
          >
            {isActive && (
              <motion.div
                layoutId="theme-indicator"
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, rgba(168,85,247,0.18), rgba(168,85,247,0.08))',
                  border: '1px solid rgba(168,85,247,0.3)',
                  boxShadow: '0 0 12px rgba(168,85,247,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              />
            )}
            <Icon size={13} className="relative z-10" />
          </motion.button>
        )
      })}
    </div>
  )
}
