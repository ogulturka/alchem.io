import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Code2, Copy, Check, FlaskConical } from 'lucide-react'
import AlchemizeButton from '../ui/AlchemizeButton'
import TestSandboxModal from '../ui/TestSandboxModal'
import CodeEditor from '../editors/CodeEditor'
import useAppStore from '../../store/useAppStore'

const outputTabs = [
  { id: 'xslt', label: 'XSLT' },
  { id: 'groovy', label: 'Groovy' },
]

const platforms = [
  { id: 'sap-cpi', label: 'SAP CPI' },
  { id: 'sap-po', label: 'SAP PO' },
  { id: 'apache-camel', label: 'Apache Camel' },
]

function CopyOverlay({ code }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    if (!code) return
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [code])

  return (
    <motion.button
      onClick={handleCopy}
      disabled={!code}
      className="absolute top-3 right-3 z-10 flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer disabled:opacity-20 disabled:cursor-default"
      style={{
        backgroundColor: copied ? '#22c55e25' : 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(8px)',
        color: copied ? '#22c55e' : 'var(--color-text-secondary)',
      }}
      whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.12)' }}
      whileTap={{ scale: 0.9 }}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.div
            key="check"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Check size={14} />
          </motion.div>
        ) : (
          <motion.div
            key="copy"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Copy size={14} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

export default function RightPanel() {
  const generatedCode = useAppStore((s) => s.generatedCode)
  const activeOutputTab = useAppStore((s) => s.activeOutputTab)
  const setActiveOutputTab = useAppStore((s) => s.setActiveOutputTab)
  const groovyPlatform = useAppStore((s) => s.groovyPlatform)
  const setGroovyPlatform = useAppStore((s) => s.setGroovyPlatform)
  const isGenerating = useAppStore((s) => s.isGenerating)
  const [sandboxOpen, setSandboxOpen] = useState(false)

  const code = generatedCode[activeOutputTab]
  const language = activeOutputTab === 'xslt' ? 'xml' : 'javascript'

  return (
    <div className="h-full flex flex-col bg-bg-secondary">

      {/* ── Panel Title ── */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <Code2 size={16} style={{ color: 'var(--color-accent)' }} />
        <span
          className="text-[13px] uppercase tracking-wider font-semibold"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Code Output
        </span>
      </div>

      {/* ── Controls Stack ── */}
      <div className="flex flex-col gap-5 px-5 pt-5 pb-4">

        {/* Layer 1: Alchemize Button */}
        <AlchemizeButton />

        {/* Layer 1.5: Test Sandbox Button */}
        <motion.button
          onClick={() => setSandboxOpen(true)}
          className="w-full py-3 px-5 rounded-xl font-semibold text-[12px] tracking-wider cursor-pointer flex items-center justify-center gap-2"
          style={{
            backgroundColor: 'var(--color-bg-tertiary)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
          whileHover={{
            scale: 1.02,
            borderColor: 'var(--color-accent)',
            boxShadow: '0 0 16px var(--color-accent-glow)',
          }}
          whileTap={{ scale: 0.97 }}
        >
          <FlaskConical size={15} style={{ color: 'var(--color-accent)' }} />
          Run Test Sandbox
        </motion.button>

        {/* Layer 2: Platform Selector (always visible, applies to Groovy output) */}
        <div className="flex flex-col gap-2">
          <label
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Target Platform
          </label>
          <select
            value={groovyPlatform}
            onChange={(e) => setGroovyPlatform(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-[12px] font-medium cursor-pointer outline-none transition-all duration-200"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-primary)',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 14px center',
              paddingRight: '36px',
            }}
          >
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Layer 3: Output Format Tabs */}
        <div
          className="flex gap-6"
          style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '2px' }}
        >
          {outputTabs.map((tab) => {
            const isActive = activeOutputTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveOutputTab(tab.id)}
                className="relative pb-3 text-[12px] font-semibold uppercase tracking-wider cursor-pointer bg-transparent border-none transition-colors"
                style={{
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                }}
              >
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="active-output-tab"
                    className="absolute bottom-0 left-0 right-0 rounded-full"
                    style={{
                      height: '2px',
                      backgroundColor: 'var(--color-accent)',
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Code Block with Copy Overlay ── */}
      <div
        className="flex-1 min-h-0 mx-4 mb-4 relative rounded-xl overflow-hidden"
        style={{
          backgroundColor: 'rgba(0,0,0,0.25)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'var(--color-border)',
        }}
      >
        <CopyOverlay code={code} />
        <AnimatePresence mode="wait">
          {isGenerating ? (
            <motion.div
              key="loading"
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex flex-col items-center gap-4">
                <div className="flex gap-1.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1.5 rounded-full"
                      style={{ backgroundColor: 'var(--color-accent)' }}
                      animate={{
                        height: [14, 32, 14],
                        opacity: [0.4, 1, 0.4],
                      }}
                      transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        delay: i * 0.1,
                      }}
                    />
                  ))}
                </div>
                <span
                  className="text-xs tracking-wide"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Generating code...
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={`output-${activeOutputTab}`}
              className="h-full"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CodeEditor value={code} language={language} readOnly />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <TestSandboxModal open={sandboxOpen} onClose={() => setSandboxOpen(false)} />
    </div>
  )
}
