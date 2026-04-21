import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FlaskConical, ArrowRight, Check, AlertCircle, Sparkles, Loader2 } from 'lucide-react'
import useAppStore from '../../store/useAppStore'
import { parseCommand } from '../../services/alchopilotService'

// Simulated LLM latency for the mocked service. Swap for real fetch() later.
const MOCK_LATENCY_MS = 650

export default function AlchopilotCommandBar() {
  const [command, setCommand] = useState('')
  const [status, setStatus] = useState(null) // { type: 'success'|'error', message }
  const [isFocused, setIsFocused] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(null), 3500)
    return () => clearTimeout(t)
  }, [status])

  const handleSubmit = useCallback(async () => {
    const text = command.trim()
    if (!text || isThinking) return

    setIsThinking(true)
    setStatus(null)

    // Mock the LLM round-trip. Real implementation swaps this for fetch().
    await new Promise((r) => setTimeout(r, MOCK_LATENCY_MS))

    const { nodes } = useAppStore.getState()
    const payload = parseCommand(text, nodes, nodes)

    if (payload.intent === 'UNKNOWN') {
      setIsThinking(false)
      setStatus({ type: 'error', message: payload.error })
      return
    }

    const result = useAppStore.getState().alchopilotExecute(payload)
    setIsThinking(false)

    if (result.ok) {
      setStatus({ type: 'success', message: result.description })
      setCommand('')
    } else {
      setStatus({ type: 'error', message: result.error })
    }
  }, [command, isThinking])

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }
  }, [handleSubmit])

  const hasInput = command.trim().length > 0

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
      {/* Status Toast */}
      <AnimatePresence>
        {status && (
          <motion.div
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-semibold"
            style={{
              backgroundColor: status.type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              color: status.type === 'success' ? '#22c55e' : '#ef4444',
              backdropFilter: 'blur(12px)',
              border: `1px solid ${status.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
          >
            {status.type === 'success' ? <Check size={13} /> : <AlertCircle size={13} />}
            {status.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Command Bar */}
      <motion.div
        className="relative"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 25 }}
      >
        {/* Outer aura glow — pulses harder while thinking */}
        <motion.div
          className="absolute -inset-4 rounded-2xl pointer-events-none"
          style={{
            background: isThinking
              ? 'radial-gradient(ellipse at center, rgba(236,72,153,0.4), transparent 70%)'
              : 'radial-gradient(ellipse at center, rgba(139,92,246,0.22), transparent 70%)',
            filter: 'blur(16px)',
          }}
          animate={{
            opacity: isThinking ? [0.6, 1, 0.6] : isFocused ? 0.9 : [0.35, 0.55, 0.35],
            scale: isFocused || isThinking ? 1.05 : 1,
          }}
          transition={{
            opacity: isThinking
              ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
              : isFocused
                ? { duration: 0.3 }
                : { duration: 3.5, repeat: Infinity, ease: 'easeInOut' },
            scale: { duration: 0.3 },
          }}
        />

        <div
          className="relative flex items-center rounded-xl overflow-hidden"
          style={{
            width: 560,
            background: 'linear-gradient(180deg, rgba(20,18,38,0.9), rgba(15,15,28,0.92))',
            backdropFilter: 'blur(24px)',
            border: `1.5px solid ${isThinking ? 'rgba(236,72,153,0.6)' : isFocused ? 'rgba(139,92,246,0.55)' : 'rgba(139,92,246,0.18)'}`,
            boxShadow: isThinking
              ? '0 0 40px rgba(236,72,153,0.45), 0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)'
              : isFocused
                ? '0 0 36px rgba(139,92,246,0.45), 0 10px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)'
                : '0 8px 32px rgba(0,0,0,0.35), 0 0 18px rgba(139,92,246,0.12), inset 0 1px 0 rgba(255,255,255,0.04)',
            transition: 'border-color 0.3s, box-shadow 0.3s',
          }}
        >
          {/* Flask icon with inner glow */}
          <div className="relative flex items-center justify-center pl-4 pr-1">
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(139,92,246,0.6), transparent 65%)',
                filter: 'blur(6px)',
              }}
              animate={{ opacity: isThinking ? 1 : isFocused ? 0.9 : [0.35, 0.7, 0.35] }}
              transition={
                isThinking
                  ? { duration: 0.3 }
                  : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
              }
            />
            <motion.div
              className="relative"
              animate={{ rotate: isThinking ? [0, -8, 8, -5, 0] : 0 }}
              transition={{ duration: 1, repeat: isThinking ? Infinity : 0 }}
            >
              <FlaskConical
                size={17}
                strokeWidth={2.2}
                style={{
                  color: isThinking ? '#f0abfc' : isFocused ? '#d8b4fe' : '#a78bfa',
                  filter: `drop-shadow(0 0 6px ${isThinking ? 'rgba(240,171,252,0.95)' : 'rgba(167,139,250,0.65)'})`,
                  transition: 'color 0.3s',
                }}
              />
            </motion.div>
          </div>

          <div
            className="flex items-center select-none pr-1 pl-1"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background: 'linear-gradient(135deg, #c4b5fd, #f0abfc)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Alchopilot
          </div>

          <div className="self-center w-px h-4 mx-1" style={{ backgroundColor: 'rgba(139,92,246,0.25)' }} />

          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={isThinking ? 'Transmuting your intent…' : 'Ask Alchopilot — try "merge name and surname to fullName"'}
            readOnly={isThinking}
            className="flex-1 bg-transparent border-none outline-none text-[13px] font-mono py-3.5 px-2 min-w-0"
            style={{
              color: isThinking ? '#f0abfc' : 'var(--color-text-primary)',
              caretColor: '#c084fc',
            }}
          />

          <motion.button
            onClick={handleSubmit}
            disabled={!hasInput || isThinking}
            className="relative flex items-center justify-center mr-2 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-default overflow-hidden"
            style={{
              width: 36,
              height: 36,
              background: isThinking
                ? 'linear-gradient(135deg, #ec4899, #a855f7)'
                : hasInput
                  ? 'linear-gradient(135deg, #a855f7, #ec4899)'
                  : 'rgba(255,255,255,0.05)',
              border: 'none',
              boxShadow: hasInput || isThinking
                ? '0 0 14px rgba(168,85,247,0.5), inset 0 1px 0 rgba(255,255,255,0.2)'
                : 'none',
            }}
            whileHover={!isThinking ? { scale: 1.08 } : {}}
            whileTap={!isThinking ? { scale: 0.92 } : {}}
          >
            <AnimatePresence mode="wait">
              {isThinking ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1, rotate: 360 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ rotate: { duration: 1, repeat: Infinity, ease: 'linear' } }}
                >
                  <Loader2 size={14} color="white" strokeWidth={2.6} />
                </motion.div>
              ) : hasInput ? (
                <motion.div key="spark" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                  <Sparkles size={14} color="white" strokeWidth={2.4} />
                </motion.div>
              ) : (
                <motion.div key="arrow" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
                  <ArrowRight size={16} color="white" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}
