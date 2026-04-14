import { useEffect, useState, useCallback, useRef } from 'react'
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import useAppStore from './store/useAppStore'
import Header from './components/layout/Header'
import LeftPanel from './components/layout/LeftPanel'
import MiddlePanel from './components/layout/MiddlePanel'
import RightPanel from './components/layout/RightPanel'

const DEFAULT_WIDTH = 380
const MIN_WIDTH = 200
const MAX_WIDTH = 800

export default function App() {
  const theme = useAppStore((s) => s.theme)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [leftWidth, setLeftWidth] = useState(DEFAULT_WIDTH)
  const [rightWidth, setRightWidth] = useState(DEFAULT_WIDTH)

  // Track which resizer is being dragged
  const dragRef = useRef(null) // 'left' | 'right' | null

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const toggleLeft = useCallback(() => setLeftOpen((v) => !v), [])
  const toggleRight = useCallback(() => setRightOpen((v) => !v), [])

  // ── Drag-to-resize logic ──
  useEffect(() => {
    function onMouseMove(e) {
      if (!dragRef.current) return
      e.preventDefault()

      if (dragRef.current === 'left') {
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX))
        setLeftWidth(newWidth)
      } else if (dragRef.current === 'right') {
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX))
        setRightWidth(newWidth)
      }
    }

    function onMouseUp() {
      if (dragRef.current) {
        dragRef.current = null
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const startDragLeft = useCallback((e) => {
    e.preventDefault()
    dragRef.current = 'left'
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const startDragRight = useCallback((e) => {
    e.preventDefault()
    dragRef.current = 'right'
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  return (
    <div className="h-screen flex flex-col bg-bg-primary text-text-primary transition-colors duration-300">
      <Header />
      <main className="flex-1 min-h-0 flex w-full">

        {/* ── Left Panel ── */}
        <div
          className="h-full shrink-0 overflow-hidden relative"
          style={{
            width: leftOpen ? leftWidth : 0,
            transition: dragRef.current ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div
            className="h-full"
            style={{
              width: leftWidth,
              opacity: leftOpen ? 1 : 0,
              transition: dragRef.current ? 'none' : 'opacity 0.2s ease',
              pointerEvents: leftOpen ? 'auto' : 'none',
            }}
          >
            <LeftPanel onCollapse={toggleLeft} isOpen={leftOpen} />
          </div>
        </div>

        {/* ── Left Resizer ── */}
        <div
          className="resizer-handle shrink-0 relative"
          onMouseDown={leftOpen ? startDragLeft : undefined}
          onClick={!leftOpen ? toggleLeft : undefined}
          style={{
            width: leftOpen ? 5 : 20,
            cursor: leftOpen ? 'col-resize' : 'pointer',
            backgroundColor: 'transparent',
            zIndex: 20,
          }}
        >
          <div
            className="resizer-line absolute inset-y-0 left-1/2 -translate-x-1/2"
            style={{
              width: 1,
              backgroundColor: 'var(--color-border)',
              transition: 'background-color 0.15s, width 0.15s',
            }}
          />
          {!leftOpen && (
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full"
              style={{
                width: 20,
                height: 20,
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <PanelLeftOpen size={11} />
            </div>
          )}
        </div>

        {/* ── Center Canvas ── */}
        <div className="flex-1 min-w-0 h-full">
          <MiddlePanel />
        </div>

        {/* ── Right Resizer ── */}
        <div
          className="resizer-handle shrink-0 relative"
          onMouseDown={rightOpen ? startDragRight : undefined}
          onClick={!rightOpen ? toggleRight : undefined}
          style={{
            width: rightOpen ? 5 : 20,
            cursor: rightOpen ? 'col-resize' : 'pointer',
            backgroundColor: 'transparent',
            zIndex: 20,
          }}
        >
          <div
            className="resizer-line absolute inset-y-0 left-1/2 -translate-x-1/2"
            style={{
              width: 1,
              backgroundColor: 'var(--color-border)',
              transition: 'background-color 0.15s, width 0.15s',
            }}
          />
          {!rightOpen && (
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full"
              style={{
                width: 20,
                height: 20,
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <PanelRightOpen size={11} />
            </div>
          )}
        </div>

        {/* ── Right Panel ── */}
        <div
          className="h-full shrink-0 overflow-hidden relative"
          style={{
            width: rightOpen ? rightWidth : 0,
            transition: dragRef.current ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div
            className="h-full"
            style={{
              width: rightWidth,
              opacity: rightOpen ? 1 : 0,
              transition: dragRef.current ? 'none' : 'opacity 0.2s ease',
              pointerEvents: rightOpen ? 'auto' : 'none',
            }}
          >
            <RightPanel onCollapse={toggleRight} isOpen={rightOpen} />
          </div>
        </div>
      </main>
    </div>
  )
}
