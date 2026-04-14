import { useState, useCallback, useMemo, useEffect } from 'react'
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react'
import { ChevronRight, ChevronDown, Database, FolderOpen, Search } from 'lucide-react'
import useAppStore from '../../store/useAppStore'

const HANDLE_SIZE = 11
const HANDLE_OFFSET = Math.ceil(HANDLE_SIZE / 2) // 6px — half sticks out

const typeColors = {
  string: '#22c55e',
  number: '#f59e0b',
  boolean: '#ef4444',
  date: '#06b6d4',
  object: 'var(--color-accent-secondary)',
  array: '#8b5cf6',
}

const TYPE_OPTIONS = ['string', 'number', 'boolean', 'date', 'object', 'array']

function matchesSearch(item, query) {
  const label = (item.field || item.label || '').toLowerCase()
  if (label.includes(query)) return true
  if (item.children) {
    return item.children.some((child) => matchesSearch(child, query))
  }
  return false
}

function TreeRow({ item, depth, parentPath, handleType, handlePosition, searchQuery, onToggle, nodeId, onTypeChange }) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = item.children && item.children.length > 0
  const fieldPath = parentPath ? `${parentPath}.${item.field || item.label}` : (item.field || item.label)
  const isLeaf = !hasChildren
  const isRight = handlePosition === 'right'

  const toggleExpand = useCallback((e) => {
    e.stopPropagation()
    setExpanded((prev) => !prev)
    // Notify parent to recalculate handle positions
    onToggle?.()
  }, [onToggle])

  // Filter: if searching, hide non-matching items
  if (searchQuery && !matchesSearch(item, searchQuery)) {
    return null
  }

  return (
    <div>
      <div
        className="group flex items-center gap-1.5 relative"
        style={{
          paddingLeft: isRight ? `${depth * 14 + 14}px` : `${depth * 14 + HANDLE_OFFSET + 14}px`,
          paddingRight: isRight ? `${HANDLE_OFFSET + 10}px` : '14px',
          minHeight: '34px',
        }}
      >
        {/* Expand/collapse or spacer */}
        {hasChildren ? (
          <button
            onClick={toggleExpand}
            className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-white/10 cursor-pointer"
            style={{ border: 'none', background: 'none', color: 'var(--color-text-secondary)' }}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* Icon */}
        {hasChildren ? (
          <FolderOpen size={12} style={{ color: 'var(--color-accent-secondary)', flexShrink: 0 }} />
        ) : (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: typeColors[item.type] || 'var(--color-accent)' }}
          />
        )}

        {/* Label */}
        <span
          className="text-[11px] font-medium truncate"
          style={{ color: hasChildren ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}
        >
          {item.field || item.label}
        </span>

        {/* Type badge — interactive select */}
        {item.type && (
          <select
            value={item.type}
            onChange={(e) => {
              e.stopPropagation()
              onTypeChange?.(fieldPath, e.target.value)
            }}
            className="nodrag text-[9px] font-mono px-1.5 py-0.5 rounded ml-auto flex-shrink-0 cursor-pointer outline-none"
            style={{
              color: typeColors[item.type] || 'var(--color-accent)',
              backgroundColor: `${typeColors[item.type] || 'var(--color-accent)'}15`,
              border: 'none',
              appearance: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              paddingRight: '6px',
            }}
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t} style={{ backgroundColor: '#1e293b', color: typeColors[t] || '#fff' }}>
                {t}
              </option>
            ))}
          </select>
        )}

        {/* Handle for leaf fields — color matches data type */}
        {isLeaf && (
          <Handle
            type={handleType}
            position={handlePosition === 'right' ? Position.Right : Position.Left}
            id={fieldPath}
            style={{
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              backgroundColor: typeColors[item.type] || 'var(--color-accent)',
              border: `2.5px solid ${typeColors[item.type] || 'var(--color-accent-glow)'}`,
              boxShadow: `0 0 8px ${typeColors[item.type] || 'var(--color-accent-glow)'}80`,
              [isRight ? 'right' : 'left']: 0,
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div
          className="relative"
          style={{
            borderLeft: '1px solid var(--color-border)',
            marginLeft: isRight ? `${depth * 14 + 22}px` : `${depth * 14 + HANDLE_OFFSET + 22}px`,
          }}
        >
          {item.children.map((child, i) => (
            <TreeRow
              key={child.field || child.label || i}
              item={child}
              depth={0}
              parentPath={fieldPath}
              handleType={handleType}
              handlePosition={handlePosition}
              searchQuery={searchQuery}
              onToggle={onToggle}
              nodeId={nodeId}
              onTypeChange={onTypeChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SoapToggle({ checked, onChange, label }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
      className="nodrag flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer border-none transition-all"
      style={{
        backgroundColor: checked ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${checked ? 'rgba(139,92,246,0.4)' : 'transparent'}`,
      }}
      title={label}
    >
      <div
        className="relative rounded-full transition-all"
        style={{
          width: 24,
          height: 14,
          backgroundColor: checked ? '#8b5cf6' : 'rgba(255,255,255,0.15)',
        }}
      >
        <div
          className="absolute top-0.5 rounded-full transition-all"
          style={{
            width: 10,
            height: 10,
            backgroundColor: '#fff',
            left: checked ? 12 : 2,
          }}
        />
      </div>
      <span
        className="text-[8px] font-bold uppercase tracking-wider"
        style={{ color: checked ? '#a78bfa' : 'var(--color-text-secondary)' }}
      >
        SOAP
      </span>
    </button>
  )
}

export default function PayloadTreeNode({ id, data }) {
  const { label, tree, handleType, handlePosition, icon } = data
  const Icon = icon === 'database' ? Database : FolderOpen
  const isRight = handlePosition === 'right'
  const [searchQuery, setSearchQuery] = useState('')
  const updateNodeInternals = useUpdateNodeInternals()
  const updateFieldType = useAppStore((s) => s.updateFieldType)

  const isSource = id === 'source-payload'
  const isSourceSoap = useAppStore((s) => s.isSourceSoap)
  const isTargetSoap = useAppStore((s) => s.isTargetSoap)
  const setSourceSoap = useAppStore((s) => s.setSourceSoap)
  const setTargetSoap = useAppStore((s) => s.setTargetSoap)

  const handleTypeChange = useCallback((fieldPath, newType) => {
    updateFieldType(id, fieldPath, newType)
  }, [id, updateFieldType])

  const normalizedQuery = searchQuery.toLowerCase().trim()

  // Recalculate handle positions whenever tree or search changes
  useEffect(() => {
    updateNodeInternals(id)
  }, [id, tree, normalizedQuery, updateNodeInternals])

  const handleTreeToggle = useCallback(() => {
    // Delay slightly so DOM updates before ReactFlow measures
    requestAnimationFrame(() => updateNodeInternals(id))
  }, [id, updateNodeInternals])

  const visibleLeafCount = useMemo(() => {
    if (!normalizedQuery) return countLeaves(tree)
    return countMatchingLeaves(tree, normalizedQuery)
  }, [tree, normalizedQuery])

  return (
    <div
      className="rounded-xl shadow-2xl"
      style={{
        width: 310,
      }}
    >
      <div
        className="rounded-xl border"
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-node-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3.5 border-b rounded-t-xl"
          style={{
            background: `linear-gradient(135deg, var(--color-node-bg), var(--color-bg-tertiary))`,
            borderColor: 'var(--color-node-border)',
          }}
        >
          <div
            className="flex items-center justify-center rounded-lg"
            style={{ width: 26, height: 26, backgroundColor: 'rgba(255,255,255,0.06)' }}
          >
            <Icon size={14} style={{ color: 'var(--color-accent)' }} />
          </div>
          <span
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: 'var(--color-accent)' }}
          >
            {label}
          </span>
          <SoapToggle
            checked={isSource ? isSourceSoap : isTargetSoap}
            onChange={isSource ? setSourceSoap : setTargetSoap}
            label={isSource ? 'Strip SOAP Envelope from source' : 'Wrap output in SOAP Envelope'}
          />
          <span
            className="text-[9px] font-mono ml-auto px-2 py-1 rounded-md"
            style={{
              color: 'var(--color-accent-glow)',
              backgroundColor: 'rgba(255,255,255,0.04)',
            }}
          >
            {visibleLeafCount > 0 ? `${visibleLeafCount} fields` : 'empty'}
          </span>
        </div>

        {/* Search bar */}
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-node-border)' }}>
          <div
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <Search size={12} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search fields..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-[11px] w-full placeholder:text-[var(--color-text-secondary)]/40"
              style={{ color: 'var(--color-text-primary)' }}
            />
          </div>
        </div>

        {/* Tree rows */}
        <div className="py-3 space-y-0.5">
          {tree.map((item, i) => (
            <TreeRow
              key={item.field || item.label || i}
              item={item}
              depth={0}
              parentPath=""
              handleType={handleType}
              handlePosition={handlePosition}
              searchQuery={normalizedQuery}
              onToggle={handleTreeToggle}
              nodeId={id}
              onTypeChange={handleTypeChange}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function countLeaves(tree) {
  let count = 0
  for (const item of tree) {
    if (item.children && item.children.length > 0) {
      count += countLeaves(item.children)
    } else {
      count++
    }
  }
  return count
}

function countMatchingLeaves(tree, query) {
  let count = 0
  for (const item of tree) {
    if (item.children && item.children.length > 0) {
      count += countMatchingLeaves(item.children, query)
    } else {
      const label = (item.field || item.label || '').toLowerCase()
      if (label.includes(query)) count++
    }
  }
  return count
}
