import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import useAppStore from './store/useAppStore'
import Header from './components/layout/Header'
import LeftPanel from './components/layout/LeftPanel'
import MiddlePanel from './components/layout/MiddlePanel'
import RightPanel from './components/layout/RightPanel'

const PANEL_WIDTH = 340
const COLLAPSED_WIDTH = 0

function PanelToggle({ side, isOpen, onClick }) {
  const isLeft = side === 'left'
  const Icon = isLeft
    ? (isOpen ? PanelLeftClose : PanelLeftOpen)
    : (isOpen ? PanelRightClose : PanelRightOpen)

  return (
    <motion.button
      onClick={onClick}
      className="absolute top-1/2 -translate-y-1/2 z-30 flex items-center justify-center rounded-full cursor-pointer"
      style={{
        width: 28,
        height: 28,
        [isLeft ? 'left' : 'right']: -14,
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1.5px solid var(--color-border)',
        color: 'var(--color-text-secondary)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
      whileHover={{
        scale: 1.15,
        borderColor: 'var(--color-accent)',
        color: 'var(--color-accent)',
        boxShadow: '0 0 12px var(--color-accent-glow)',
      }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      title={isOpen ? `Collapse ${side} panel` : `Expand ${side} panel`}
    >
      <Icon size={14} />
    </motion.button>
  )
}

export default function App() {
  const theme = useAppStore((s) => s.theme)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggleLeft = useCallback(() => setLeftOpen((v) => !v), [])
  const toggleRight = useCallback(() => setRightOpen((v) => !v), [])

  return (
    <div className="h-screen flex flex-col bg-bg-primary text-text-primary transition-colors duration-300">
      <Header />
      <main className="flex-1 min-h-0 flex w-full">

        {/* ── Left Panel ── */}
        <div
          className="h-full shrink-0 overflow-hidden relative"
          style={{
            width: leftOpen ? PANEL_WIDTH : COLLAPSED_WIDTH,
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div
            className="h-full"
            style={{
              width: PANEL_WIDTH,
              opacity: leftOpen ? 1 : 0,
              transition: 'opacity 0.2s ease',
              pointerEvents: leftOpen ? 'auto' : 'none',
            }}
          >
            <LeftPanel />
          </div>
        </div>

        {/* ── Divider Left ── */}
        <div className="relative shrink-0" style={{ width: 1, backgroundColor: 'var(--color-border)' }}>
          <PanelToggle side="left" isOpen={leftOpen} onClick={toggleLeft} />
        </div>

        {/* ── Center Canvas ── */}
        <div className="flex-1 min-w-0 h-full">
          <MiddlePanel />
        </div>

        {/* ── Divider Right ── */}
        <div className="relative shrink-0" style={{ width: 1, backgroundColor: 'var(--color-border)' }}>
          <PanelToggle side="right" isOpen={rightOpen} onClick={toggleRight} />
        </div>

        {/* ── Right Panel ── */}
        <div
          className="h-full shrink-0 overflow-hidden relative"
          style={{
            width: rightOpen ? PANEL_WIDTH : COLLAPSED_WIDTH,
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div
            className="h-full"
            style={{
              width: PANEL_WIDTH,
              opacity: rightOpen ? 1 : 0,
              transition: 'opacity 0.2s ease',
              pointerEvents: rightOpen ? 'auto' : 'none',
            }}
          >
            <RightPanel />
          </div>
        </div>
      </main>
    </div>
  )
}
