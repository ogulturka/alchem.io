import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Server } from 'lucide-react'
import useAppStore from '../../store/useAppStore'

const tabs = [
  { id: 'xslt', label: 'XSLT' },
  { id: 'groovy', label: 'Groovy' },
]

const platforms = [
  { id: 'sap-cpi', label: 'SAP CPI', short: 'CPI' },
  { id: 'sap-po', label: 'SAP PO', short: 'PO' },
  { id: 'apache-camel', label: 'Apache Camel', short: 'Camel' },
]

export default function TabBar() {
  const activeOutputTab = useAppStore((s) => s.activeOutputTab)
  const setActiveOutputTab = useAppStore((s) => s.setActiveOutputTab)
  const groovyPlatform = useAppStore((s) => s.groovyPlatform)
  const setGroovyPlatform = useAppStore((s) => s.setGroovyPlatform)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  const activePlatform = platforms.find((p) => p.id === groovyPlatform)

  useEffect(() => {
    if (!dropdownOpen) return
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    const handleKey = (e) => { if (e.key === 'Escape') setDropdownOpen(false) }
    window.addEventListener('mousedown', handleClick, true)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick, true)
      window.removeEventListener('keydown', handleKey)
    }
  }, [dropdownOpen])

  return (
    <div className="flex border-b border-border items-center px-2">
      {tabs.map((tab) => {
        const isActive = activeOutputTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => setActiveOutputTab(tab.id)}
            className={`relative flex-1 py-3.5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer bg-transparent border-none ${
              isActive ? 'text-accent' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
            {isActive && (
              <motion.div
                layoutId="active-output-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ backgroundColor: 'var(--color-accent)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        )
      })}

      {/* Platform Dropdown — visible when Groovy tab is active */}
      {activeOutputTab === 'groovy' && (
        <div className="relative pr-3" ref={dropdownRef}>
          <motion.button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-semibold uppercase tracking-wider cursor-pointer bg-transparent"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-accent)',
            }}
            whileHover={{
              borderColor: 'var(--color-accent)',
              boxShadow: '0 0 8px var(--color-accent-glow)',
            }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <Server size={10} />
            <span>{activePlatform?.short}</span>
            <ChevronDown
              size={10}
              style={{
                transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 0.2s ease',
              }}
            />
          </motion.button>

          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                className="absolute right-0 top-full mt-2 z-50 rounded-xl border shadow-2xl overflow-hidden backdrop-blur-xl"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-bg-secondary) 95%, transparent)',
                  borderColor: 'var(--color-border)',
                  minWidth: 170,
                }}
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              >
                {platforms.map((p) => {
                  const isSelected = p.id === groovyPlatform
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setGroovyPlatform(p.id)
                        setDropdownOpen(false)
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left cursor-pointer bg-transparent border-none transition-colors"
                      style={{
                        color: isSelected ? 'var(--color-accent)' : 'var(--color-text-primary)',
                        backgroundColor: isSelected ? 'var(--color-accent-glow)10' : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: isSelected ? 'var(--color-accent)' : 'var(--color-border)',
                          boxShadow: isSelected ? '0 0 6px var(--color-accent-glow)' : 'none',
                        }}
                      />
                      <span className="text-[11px] font-medium">{p.label}</span>
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
