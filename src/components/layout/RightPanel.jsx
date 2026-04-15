import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Code2, Copy, Check, FlaskConical, PanelRightClose, ChevronDown, Server } from 'lucide-react'
import AlchemizeButton from '../ui/AlchemizeButton'
import TestSandboxModal from '../ui/TestSandboxModal'
import CodeEditor from '../editors/CodeEditor'
import useAppStore from '../../store/useAppStore'

const outputTabs = [
  { id: 'xslt', label: 'XSLT', accent: '#06b6d4' },
  { id: 'groovy', label: 'Groovy', accent: '#22c55e' },
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
      className="absolute top-3 right-3 z-10 flex items-center justify-center rounded-lg cursor-pointer disabled:opacity-20 disabled:cursor-default border-none"
      style={{
        width: 30,
        height: 30,
        backgroundColor: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(8px)',
        border: copied ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.08)',
        color: copied ? '#22c55e' : 'var(--color-text-secondary)',
      }}
      whileHover={{ scale: 1.08, backgroundColor: copied ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)' }}
      whileTap={{ scale: 0.92 }}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.div key="check" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
            <Check size={14} strokeWidth={2.5} />
          </motion.div>
        ) : (
          <motion.div key="copy" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.15 }}>
            <Copy size={13} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

export default function RightPanel({ onCollapse }) {
  const generatedCode = useAppStore((s) => s.generatedCode)
  const activeOutputTab = useAppStore((s) => s.activeOutputTab)
  const setActiveOutputTab = useAppStore((s) => s.setActiveOutputTab)
  const groovyPlatform = useAppStore((s) => s.groovyPlatform)
  const setGroovyPlatform = useAppStore((s) => s.setGroovyPlatform)
  const isGenerating = useAppStore((s) => s.isGenerating)
  const [sandboxOpen, setSandboxOpen] = useState(false)

  const code = generatedCode[activeOutputTab]
  const language = activeOutputTab === 'xslt' ? 'xml' : 'javascript'
  const activeTabAccent = outputTabs.find((t) => t.id === activeOutputTab)?.accent || 'var(--color-accent)'

  return (
    <div className="h-full flex flex-col bg-bg-secondary">

      {/* ── Header ── */}
      <div className="flex items-center justify-between w-full px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 size={14} className="text-accent flex-shrink-0" />
          <span className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">
            Code Output
          </span>
        </div>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="flex items-center justify-center rounded-md cursor-pointer border-none transition-colors p-1 flex-shrink-0"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--color-text-secondary)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent)'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.backgroundColor = 'transparent' }}
            title="Collapse right panel"
          >
            <PanelRightClose size={14} />
          </button>
        )}
      </div>

      {/* ── Controls Stack ── */}
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3">

        {/* Primary action: Alchemize */}
        <AlchemizeButton />

        {/* Secondary action: Test Sandbox */}
        <motion.button
          onClick={() => setSandboxOpen(true)}
          className="w-full py-2.5 px-4 rounded-xl font-semibold text-[12px] cursor-pointer flex items-center justify-center gap-2 border-none"
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--color-text-primary)',
            transition: 'all 0.2s',
          }}
          whileHover={{
            backgroundColor: 'rgba(168,85,247,0.08)',
            borderColor: 'rgba(168,85,247,0.3)',
            boxShadow: '0 0 12px rgba(168,85,247,0.15)',
          }}
          whileTap={{ scale: 0.98 }}
        >
          <FlaskConical size={13} style={{ color: '#a78bfa' }} />
          Run Test Sandbox
        </motion.button>

        {/* Platform Selector */}
        <div className="flex flex-col gap-1.5 mt-1">
          <label
            className="text-[10.5px] font-medium flex items-center gap-1.5"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <Server size={10} style={{ opacity: 0.7 }} />
            Target Platform
          </label>
          <div className="relative">
            <select
              value={groovyPlatform}
              onChange={(e) => setGroovyPlatform(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg text-[12px] font-medium cursor-pointer outline-none transition-all"
              style={{
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--color-text-primary)',
                appearance: 'none',
                paddingRight: '32px',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'rgba(168,85,247,0.4)'
                e.target.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.08)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255,255,255,0.08)'
                e.target.style.boxShadow = 'none'
              }}
            >
              {platforms.map((p) => (
                <option key={p.id} value={p.id} style={{ backgroundColor: 'var(--color-bg-secondary)' }}>{p.label}</option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}
            />
          </div>
        </div>

        {/* Output Format Tabs (Segmented Control) */}
        <div
          className="flex items-center rounded-lg p-0.5 mt-1"
          style={{
            backgroundColor: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {outputTabs.map((tab) => {
            const isActive = activeOutputTab === tab.id
            return (
              <motion.button
                key={tab.id}
                onClick={() => setActiveOutputTab(tab.id)}
                className="relative flex-1 py-1.5 text-[11.5px] font-semibold cursor-pointer border-none rounded-md"
                style={{
                  backgroundColor: 'transparent',
                  color: isActive ? tab.accent : 'var(--color-text-secondary)',
                  transition: 'color 0.15s',
                }}
                whileTap={{ scale: 0.97 }}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-output-tab"
                    className="absolute inset-0 rounded-md"
                    style={{
                      backgroundColor: `${tab.accent}20`,
                      border: `1px solid ${tab.accent}40`,
                      boxShadow: `0 0 12px ${tab.accent}30`,
                    }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* ── Code Block with Copy Overlay ── */}
      <div
        className="flex-1 min-h-0 mx-4 mb-4 relative rounded-xl overflow-hidden"
        style={{
          backgroundColor: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)',
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
                      className="w-1 rounded-full"
                      style={{ backgroundColor: activeTabAccent }}
                      animate={{
                        height: [12, 28, 12],
                        opacity: [0.3, 1, 0.3],
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
                  className="text-[11px]"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Generating code…
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={`output-${activeOutputTab}`}
              className="h-full"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
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
