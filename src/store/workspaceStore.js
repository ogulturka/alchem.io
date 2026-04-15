/**
 * Workspace store — persists a list of projects (sessions) to localStorage.
 *
 * A project captures the full working state: source/target payloads, formats,
 * SOAP flags, canvas nodes/edges, UDF library, and Groovy platform.
 *
 * The "current" working state lives in useAppStore. Switching projects
 * copies the saved data into useAppStore; edits in useAppStore auto-sync
 * back to the active project (debounced 500ms) and are then persisted.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import useAppStore from './useAppStore'

// ── Fields that constitute a project's snapshot ──
const PROJECT_FIELDS = [
  'requestCode',
  'responseStructure',
  'sourceFormat',
  'targetFormat',
  'isSourceSoap',
  'isTargetSoap',
  'nodes',
  'edges',
  'udfs',
  'groovyPlatform',
]

function snapshotFromAppStore() {
  const s = useAppStore.getState()
  const snap = {}
  for (const f of PROJECT_FIELDS) snap[f] = s[f]
  return snap
}

let _isApplying = false
function applyToAppStore(data) {
  if (!data) return
  _isApplying = true
  const update = {}
  for (const f of PROJECT_FIELDS) {
    if (f in data) update[f] = data[f]
  }
  useAppStore.setState(update)
  // Give React a moment to flush before re-enabling auto-save
  setTimeout(() => { _isApplying = false }, 100)
}

function genProjectId() {
  return `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

// ── A blank project template ──
function blankProjectData() {
  return {
    requestCode: '<?xml version="1.0" encoding="UTF-8"?>\n<Request>\n</Request>',
    responseStructure: '{\n}',
    sourceFormat: 'xml',
    targetFormat: 'json',
    isSourceSoap: false,
    isTargetSoap: false,
    nodes: [
      {
        id: 'source-payload',
        type: 'payloadTree',
        position: { x: 0, y: 0 },
        draggable: true,
        data: { label: 'Source Payload', tree: [], handleType: 'source', handlePosition: 'right', icon: 'database' },
      },
      {
        id: 'target-payload',
        type: 'payloadTree',
        position: { x: 750, y: 0 },
        draggable: true,
        data: { label: 'Target Payload', tree: [], handleType: 'target', handlePosition: 'left', icon: 'folder' },
      },
    ],
    edges: [],
    udfs: [],
    groovyPlatform: 'sap-cpi',
  }
}

const useWorkspaceStore = create(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,

      createNewProject: (name) => {
        const id = genProjectId()
        const now = Date.now()
        const data = blankProjectData()
        const project = {
          id,
          name: name || `Project ${get().projects.length + 1}`,
          createdAt: now,
          lastModified: now,
          data,
        }
        set({
          projects: [...get().projects, project],
          activeProjectId: id,
        })
        applyToAppStore(data)
      },

      /** Create a project seeded from the current useAppStore state */
      createProjectFromCurrent: (name) => {
        const id = genProjectId()
        const now = Date.now()
        const project = {
          id,
          name: name || `Project ${get().projects.length + 1}`,
          createdAt: now,
          lastModified: now,
          data: snapshotFromAppStore(),
        }
        set({
          projects: [...get().projects, project],
          activeProjectId: id,
        })
      },

      loadProject: (id) => {
        const project = get().projects.find((p) => p.id === id)
        if (!project) return
        applyToAppStore(project.data)
        set({ activeProjectId: id })
      },

      saveActiveProject: () => {
        const { projects, activeProjectId } = get()
        if (!activeProjectId) return
        const snap = snapshotFromAppStore()
        const updated = projects.map((p) =>
          p.id === activeProjectId
            ? { ...p, data: snap, lastModified: Date.now() }
            : p
        )
        set({ projects: updated })
      },

      renameProject: (id, newName) => {
        if (!newName || !newName.trim()) return
        const updated = get().projects.map((p) =>
          p.id === id ? { ...p, name: newName.trim(), lastModified: Date.now() } : p
        )
        set({ projects: updated })
      },

      deleteProject: (id) => {
        const { projects, activeProjectId } = get()
        const filtered = projects.filter((p) => p.id !== id)

        if (activeProjectId === id) {
          // Load the first remaining project, or create a blank one
          if (filtered.length > 0) {
            applyToAppStore(filtered[0].data)
            set({ projects: filtered, activeProjectId: filtered[0].id })
          } else {
            set({ projects: filtered, activeProjectId: null })
            // Auto-create a fresh default project so the app always has an active session
            get().createNewProject('Default')
          }
        } else {
          set({ projects: filtered })
        }
      },
    }),
    {
      name: 'alchemio-workspace',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
      }),
    }
  )
)

// ── Initialization: ensure an active project exists on boot ──
// Must run after persist hydration (synchronous for localStorage)
function initializeWorkspace() {
  const state = useWorkspaceStore.getState()
  if (state.projects.length === 0) {
    // First run — save the demo state as a starter project
    state.createProjectFromCurrent('Demo Project')
    return
  }
  if (state.activeProjectId) {
    const active = state.projects.find((p) => p.id === state.activeProjectId)
    if (active) applyToAppStore(active.data)
  } else {
    // Projects exist but no active one — load the first
    state.loadProject(state.projects[0].id)
  }
}

initializeWorkspace()

// ── Auto-save: subscribe to useAppStore changes, debounce, write to active project ──
let saveTimer = null
useAppStore.subscribe(() => {
  if (_isApplying) return
  const ws = useWorkspaceStore.getState()
  if (!ws.activeProjectId) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    ws.saveActiveProject()
  }, 500)
})

export default useWorkspaceStore
