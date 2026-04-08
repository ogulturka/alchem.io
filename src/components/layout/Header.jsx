import { FlaskConical } from 'lucide-react'
import ThemeSwitcher from '../ui/ThemeSwitcher'

export default function Header() {
  return (
    <header className="h-16 flex-shrink-0 flex items-center justify-between px-8 bg-bg-secondary border-b border-border">
      <div className="flex items-center gap-3">
        <FlaskConical size={24} className="text-accent" />
        <h1 className="text-xl font-bold bg-gradient-to-r from-accent to-accent-glow bg-clip-text text-transparent">
          Alchem.io
        </h1>
      </div>
      <ThemeSwitcher />
    </header>
  )
}
