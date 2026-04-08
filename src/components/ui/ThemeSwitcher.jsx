import { motion } from 'framer-motion'
import { Moon, Sun, Waves } from 'lucide-react'
import useAppStore from '../../store/useAppStore'

const themes = [
  { id: 'carbon', label: 'Carbon', icon: Moon, description: 'Dark' },
  { id: 'stark', label: 'Stark', icon: Sun, description: 'Light' },
  { id: 'oceanic', label: 'Oceanic', icon: Waves, description: 'Blue' },
]

export default function ThemeSwitcher() {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)

  return (
    <div className="flex items-center gap-1 rounded-lg bg-bg-tertiary p-1 border border-border">
      {themes.map((t) => {
        const Icon = t.icon
        const isActive = theme === t.id
        return (
          <motion.button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {isActive && (
              <motion.div
                layoutId="theme-indicator"
                className="absolute inset-0 rounded-md bg-bg-secondary border border-border"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon size={14} />
              {t.label}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}
