import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Loader2 } from 'lucide-react'
import useAppStore from '../../store/useAppStore'

export default function AlchemizeButton() {
  const isGenerating = useAppStore((s) => s.isGenerating)
  const alchemize = useAppStore((s) => s.alchemize)

  return (
    <motion.button
      onClick={alchemize}
      disabled={isGenerating}
      className="relative w-full py-3 px-5 rounded-xl font-semibold text-white text-[13px] cursor-pointer disabled:cursor-wait border-none overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
        boxShadow: '0 8px 24px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.18)',
      }}
      whileHover={!isGenerating ? {
        scale: 1.01,
        boxShadow: '0 10px 32px rgba(168,85,247,0.5), inset 0 1px 0 rgba(255,255,255,0.22)',
      } : {}}
      whileTap={!isGenerating ? { scale: 0.98 } : {}}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
    >
      {/* Subtle shimmer overlay */}
      <div
        className="absolute inset-0 opacity-50 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 30% 0%, rgba(255,255,255,0.15), transparent 60%)',
        }}
      />

      <AnimatePresence mode="wait">
        {isGenerating ? (
          <motion.span
            key="loading"
            className="relative flex items-center justify-center gap-2"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            <Loader2 size={15} className="animate-spin" />
            Transmuting…
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            className="relative flex items-center justify-center gap-2"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            <Sparkles size={15} strokeWidth={2.2} />
            Alchemize Code
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}
