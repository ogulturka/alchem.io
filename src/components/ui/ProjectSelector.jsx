import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderOpen, ChevronDown, Plus, Trash2, Check, Pencil, FileBox, Trash } from 'lucide-react'
import useWorkspaceStore from '../../store/workspaceStore'
import NewProjectModal from './NewProjectModal'
import ConfirmDialog from './ConfirmDialog'

// ── Relative time formatter ──
function formatRelativeTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const sec = Math.round(diff / 1000)
  if (sec < 15) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(ts).toLocaleDateString()
}

function ProjectRow({ project, isActive, onLoad, onDelete, onRename }) {
  const [editing, setEditing] = useState(false)
  const [tmpName, setTmpName] = useState(project.name)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commitRename = () => {
    if (tmpName.trim() && tmpName.trim() !== project.name) {
      onRename(project.id, tmpName.trim())
    }
    setEditing(false)
  }

  return (
    <div
      className="group flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors"
      style={{
        backgroundColor: isActive ? 'rgba(168,85,247,0.1)' : 'transparent',
        border: isActive ? '1px solid rgba(168,85,247,0.25)' : '1px solid transparent',
      }}
      onClick={() => !editing && onLoad(project.id)}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      <div className="flex-shrink-0" style={{ width: 14 }}>
        {isActive && <Check size={13} style={{ color: '#a78bfa' }} strokeWidth={2.5} />}
      </div>

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={tmpName}
            onChange={(e) => setTmpName(e.target.value)}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') { setTmpName(project.name); setEditing(false) }
            }}
            className="w-full text-[12px] font-medium outline-none bg-transparent border-b"
            style={{
              color: 'var(--color-text-primary)',
              borderColor: 'rgba(168,85,247,0.5)',
            }}
          />
        ) : (
          <div className="text-[12px] font-medium truncate" style={{ color: isActive ? '#c4b5fd' : 'var(--color-text-primary)' }}>
            {project.name}
          </div>
        )}
        <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>
          {formatRelativeTime(project.lastModified)}
        </div>
      </div>

      {/* Action buttons — shown on hover */}
      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true); setTmpName(project.name) }}
          className="flex items-center justify-center rounded cursor-pointer border-none"
          style={{ width: 22, height: 22, backgroundColor: 'transparent', color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          title="Rename"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(project) }}
          className="flex items-center justify-center rounded cursor-pointer border-none"
          style={{ width: 22, height: 22, backgroundColor: 'transparent', color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#ef4444' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          title="Delete"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}

export default function ProjectSelector() {
  const projects = useWorkspaceStore((s) => s.projects)
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId)
  const loadProject = useWorkspaceStore((s) => s.loadProject)
  const createNewProject = useWorkspaceStore((s) => s.createNewProject)
  const deleteProject = useWorkspaceStore((s) => s.deleteProject)
  const renameProject = useWorkspaceStore((s) => s.renameProject)

  const [open, setOpen] = useState(false)
  const [newModalOpen, setNewModalOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null) // project object or null
  const containerRef = useRef(null)

  const active = projects.find((p) => p.id === activeProjectId)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const handleLoad = useCallback((id) => {
    loadProject(id)
    setOpen(false)
  }, [loadProject])

  const handleNew = useCallback(() => {
    setOpen(false)
    setNewModalOpen(true)
  }, [])

  const handleCreateConfirm = useCallback((name) => {
    createNewProject(name)
  }, [createNewProject])

  return (
    <div ref={containerRef} className="relative">
      <motion.button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md cursor-pointer border-none"
        style={{
          height: 30,
          padding: '0 10px',
          backgroundColor: open ? 'rgba(168,85,247,0.1)' : 'transparent',
          border: open ? '1px solid rgba(168,85,247,0.25)' : '1px solid rgba(255,255,255,0.06)',
          color: 'var(--color-text-primary)',
          transition: 'all 0.15s',
        }}
        whileTap={{ scale: 0.98 }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
          }
        }}
      >
        <FolderOpen size={13} style={{ color: '#a78bfa' }} />
        <span className="text-[12px] font-medium max-w-[180px] truncate">
          {active?.name || 'No Project'}
        </span>
        <ChevronDown
          size={12}
          style={{
            color: 'var(--color-text-secondary)',
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
          }}
        />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full mt-2 rounded-lg overflow-hidden"
            style={{
              width: 320,
              zIndex: 50,
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 30px rgba(168,85,247,0.1)',
            }}
          >
            {/* Accent line */}
            <div
              className="h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.6), transparent)' }}
            />

            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <FileBox size={13} style={{ color: '#a78bfa' }} />
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>
                Projects
              </span>
              <span className="ml-auto text-[10px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>
                {projects.length} total
              </span>
            </div>

            {/* Project list */}
            <div className="max-h-[320px] overflow-y-auto p-1.5 flex flex-col gap-0.5">
              {projects.length === 0 ? (
                <div className="text-center py-8 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  No projects yet
                </div>
              ) : (
                projects.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    isActive={p.id === activeProjectId}
                    onLoad={handleLoad}
                    onDelete={(proj) => setPendingDelete(proj)}
                    onRename={renameProject}
                  />
                ))
              )}
            </div>

            {/* New project */}
            <div className="p-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <motion.button
                onClick={handleNew}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-md cursor-pointer border-none text-[12px] font-semibold text-white"
                style={{
                  background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                  boxShadow: '0 2px 8px rgba(168,85,247,0.3)',
                }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                <Plus size={13} strokeWidth={2.5} />
                New Project
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <NewProjectModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreate={handleCreateConfirm}
        defaultName={`Project ${projects.length + 1}`}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteProject(pendingDelete.id)}
        icon={Trash}
        title="Delete project?"
        description={pendingDelete ? `"${pendingDelete.name}" and all its mappings, payloads, and UDFs will be permanently removed. This action cannot be undone.` : ''}
        confirmLabel="Delete Project"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  )
}
