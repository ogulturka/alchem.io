import { useEffect } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import useAppStore from './store/useAppStore'
import Header from './components/layout/Header'
import LeftPanel from './components/layout/LeftPanel'
import MiddlePanel from './components/layout/MiddlePanel'
import RightPanel from './components/layout/RightPanel'

function ResizeHandle() {
  return (
    <Separator className="group relative flex items-center justify-center w-4">
      {/* Visible line */}
      <div
        className="w-[2px] h-full transition-all duration-200 rounded-full group-hover:w-[3px] group-hover:bg-purple-400 group-data-[separator=drag]:w-[3px] group-data-[separator=drag]:bg-purple-500"
        style={{
          backgroundColor: 'var(--color-border)',
        }}
      />
      {/* Glow overlay on hover/drag */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 group-data-[separator=drag]:opacity-100 transition-opacity duration-200"
        style={{
          background: `linear-gradient(90deg, transparent, var(--color-accent-glow), transparent)`,
          filter: 'blur(4px)',
        }}
      />
    </Separator>
  )
}

export default function App() {
  const theme = useAppStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <div className="h-screen flex flex-col bg-bg-primary text-text-primary transition-colors duration-300">
      <Header />
      <main className="flex-1 min-h-0 h-full w-full">
        <Group orientation="horizontal" className="h-full w-full">
          <Panel defaultSize="20%" minSize="15%" maxSize="40%">
            <LeftPanel />
          </Panel>
          <ResizeHandle />
          <Panel defaultSize="60%" minSize="30%">
            <MiddlePanel />
          </Panel>
          <ResizeHandle />
          <Panel defaultSize="20%" minSize="15%" maxSize="40%">
            <RightPanel />
          </Panel>
        </Group>
      </main>
    </div>
  )
}
