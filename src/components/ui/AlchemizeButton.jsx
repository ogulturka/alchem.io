import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Loader2 } from 'lucide-react'
import useAppStore from '../../store/useAppStore'

export default function AlchemizeButton() {
  const isGenerating = useAppStore((s) => s.isGenerating)
  const alchemize = useAppStore((s) => s.alchemize)

  return (
    <div className="relative">
      {/* Glow ring */}
      <div
        className="absolute -inset-1.5 rounded-full blur-lg opacity-40 animate-pulse"
        style={{ backgroundColor: 'var(--color-accent-glow)' }}
      />

      <motion.button
        onClick={alchemize}
        disabled={isGenerating}
        className="relative w-full py-4 px-6 rounded-lg font-bold text-white text-sm tracking-wider cursor-pointer disabled:cursor-wait"
        style={{
          background: `linear-gradient(135deg, var(--color-accent), var(--color-accent-glow))`,
          boxShadow: '0 0 24px var(--color-accent-glow), 0 4px 16px rgba(0,0,0,0.3)',
        }}
        whileHover={{ scale: 1.03, boxShadow: '0 0 36px var(--color-accent-glow), 0 6px 24px rgba(0,0,0,0.3)' }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      >
        <AnimatePresence mode="wait">
          {isGenerating ? (
            <motion.span
              key="loading"
              className="flex items-center justify-center gap-2.5"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15 }}
            >
              <Loader2 size={18} className="animate-spin" />
              Transmuting...
            </motion.span>
          ) : (
            <motion.span
              key="idle"
              className="flex items-center justify-center gap-2.5"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15 }}
            >
              <Sparkles size={18} />
              Alchemize Code
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  )
}
