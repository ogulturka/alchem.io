import { FlaskConical } from 'lucide-react'
import ThemeSwitcher from '../ui/ThemeSwitcher'

export default function Header() {
  return (
    <header
      className="h-14 flex-shrink-0 flex items-center justify-between px-6 border-b"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div
          className="flex items-center justify-center rounded-lg"
          style={{
            width: 32,
            height: 32,
            background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(168,85,247,0.05))',
            border: '1px solid rgba(168,85,247,0.25)',
            boxShadow: '0 0 12px rgba(168,85,247,0.15)',
          }}
        >
          <FlaskConical size={16} className="text-accent" />
        </div>
        <h1 className="text-base font-semibold tracking-tight">
          <span className="bg-gradient-to-r from-accent to-accent-glow bg-clip-text text-transparent">
            Alchem
          </span>
          <span style={{ color: 'var(--color-text-secondary)' }}>.io</span>
        </h1>
      </div>

      {/* Right Actions */}
      <div className="flex items-center">
        <ThemeSwitcher />
      </div>
    </header>
  )
}
