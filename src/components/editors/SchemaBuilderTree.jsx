import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, ChevronRight, ChevronDown, Sparkles, FileCode, Hash, ToggleLeft, FolderOpen, List, Calendar } from 'lucide-react'
import { createEmptyNode, generatePayloadFromSchema } from '../../utils/schemaGenerator'

const TYPES = [
  { id: 'string', label: 'String', icon: FileCode, color: '#22c55e' },
  { id: 'number', label: 'Integer', icon: Hash, color: '#f59e0b' },
  { id: 'date', label: 'Date', icon: Calendar, color: '#0ea5e9' },
  { id: 'boolean', label: 'Boolean', icon: ToggleLeft, color: '#ef4444' },
  { id: 'object', label: 'Object', icon: FolderOpen, color: '#a78bfa' },
  { id: 'array', label: 'Array', icon: List, color: '#06b6d4' },
]

const CARDINALITIES = [
  { id: '1', label: '1', desc: 'Required' },
  { id: '0..1', label: '0..1', desc: 'Optional' },
  { id: '1..n', label: '1..n', desc: 'Required list' },
  { id: '0..n', label: '0..n', desc: 'Optional list' },
]

function getTypeMeta(typeId) {
  return TYPES.find((t) => t.id === typeId) || TYPES[0]
}

function isContainer(type) {
  return type === 'object' || type === 'array'
}

function isMultiple(card) {
  return card === '0..n' || card === '1..n'
}

function SchemaRow({ node, depth, onUpdate, onDelete, onAddChild }) {
  const [expanded, setExpanded] = useState(true)
  const typeMeta = getTypeMeta(node.type)
  const TypeIcon = typeMeta.icon
  const hasChildren = isContainer(node.type) && node.children && node.children.length > 0
  const canHaveChildren = isContainer(node.type)

  const updateField = (field, value) => {
    let updated = { ...node, [field]: value }
    if (field === 'type') {
      // Auto-add a starter child when type changes to object/array and there are no children yet
      if (isContainer(value) && (!node.children || node.children.length === 0)) {
        updated.children = [createEmptyNode()]
        setExpanded(true)
      }
      // Clear children when changing from container to primitive
      if (!isContainer(value) && isContainer(node.type)) {
        updated.children = []
      }
      // Type 'array' implies multiplicity → auto-set cardinality 0..n
      if (value === 'array' && (node.cardinality === '1' || node.cardinality === '0..1')) {
        updated.cardinality = '0..n'
      }
      // Switching away from array back to a single value → reset to 1
      if (node.type === 'array' && value !== 'array' && (node.cardinality === '0..n' || node.cardinality === '1..n')) {
        updated.cardinality = '1'
      }
    }
    onUpdate(updated)
  }

  const updateChild = (childId, updatedChild) => {
    const newChildren = node.children.map((c) => (c.id === childId ? updatedChild : c))
    onUpdate({ ...node, children: newChildren })
  }

  const deleteChild = (childId) => {
    onUpdate({ ...node, children: node.children.filter((c) => c.id !== childId) })
  }

  const addChild = () => {
    const newChild = createEmptyNode()
    onUpdate({ ...node, children: [...(node.children || []), newChild] })
    setExpanded(true)
  }

  return (
    <div>
      <div
        className="group flex items-center py-1 rounded-md transition-colors"
        style={{
          backgroundColor: 'transparent',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.025)' }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        {/* ── LEFT: tree indent + name (flexible, can shrink) ── */}
        <div
          className="flex items-center gap-2 flex-1 min-w-0"
          style={{ paddingLeft: `${depth * 14 + 8}px`, paddingRight: 8 }}
        >
          {/* Expand/collapse */}
          {canHaveChildren ? (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center justify-center w-4 h-4 rounded cursor-pointer border-none flex-shrink-0"
              style={{ backgroundColor: 'transparent', color: 'var(--color-text-secondary)' }}
            >
              {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}

          {/* Type icon */}
          <div
            className="flex items-center justify-center rounded flex-shrink-0"
            style={{
              width: 18,
              height: 18,
              backgroundColor: `${typeMeta.color}15`,
              border: `1px solid ${typeMeta.color}30`,
            }}
          >
            <TypeIcon size={10} style={{ color: typeMeta.color }} />
          </div>

          {/* Name input — shrinks to fit available space */}
          <input
            type="text"
            value={node.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="fieldName"
            title={node.name}
            className="text-[12px] font-mono outline-none transition-colors px-2 py-1 rounded w-full min-w-0"
            style={{
              backgroundColor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: node.name ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'rgba(168,85,247,0.4)'
              e.target.style.backgroundColor = 'rgba(168,85,247,0.04)'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(255,255,255,0.06)'
              e.target.style.backgroundColor = 'rgba(255,255,255,0.03)'
            }}
          />
        </div>

        {/* ── RIGHT: type + cardinality + actions (always visible) ── */}
        <div className="flex items-center gap-1.5 flex-shrink-0 pl-2 pr-2">
          {/* Type select */}
          <select
            value={node.type}
            onChange={(e) => updateField('type', e.target.value)}
            className="text-[11px] cursor-pointer outline-none rounded px-1.5 py-1 flex-shrink-0"
            style={{
              backgroundColor: `${typeMeta.color}12`,
              border: `1px solid ${typeMeta.color}25`,
              color: typeMeta.color,
              appearance: 'none',
              paddingRight: '6px',
              width: 80,
            }}
          >
            {TYPES.map((t) => (
              <option key={t.id} value={t.id} style={{ backgroundColor: 'var(--color-bg-secondary)', color: t.color }}>
                {t.label}
              </option>
            ))}
          </select>

          {/* Cardinality select */}
          <select
            value={node.cardinality}
            onChange={(e) => updateField('cardinality', e.target.value)}
            className="text-[10px] font-mono font-semibold cursor-pointer outline-none rounded px-1.5 py-1 flex-shrink-0"
            style={{
              backgroundColor: isMultiple(node.cardinality) ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,0.04)',
              border: isMultiple(node.cardinality) ? '1px solid rgba(6,182,212,0.25)' : '1px solid rgba(255,255,255,0.08)',
              color: isMultiple(node.cardinality) ? '#06b6d4' : 'var(--color-text-secondary)',
              appearance: 'none',
              paddingRight: '6px',
              width: 64,
              textAlign: 'center',
            }}
            title={CARDINALITIES.find((c) => c.id === node.cardinality)?.desc}
          >
            {CARDINALITIES.map((c) => (
              <option key={c.id} value={c.id} style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                {c.label}
              </option>
            ))}
          </select>

          {/* Add child button */}
          {canHaveChildren && (
            <button
              onClick={addChild}
              className="flex items-center justify-center rounded cursor-pointer border-none flex-shrink-0 transition-all opacity-0 group-hover:opacity-100"
              style={{
                width: 22,
                height: 22,
                backgroundColor: 'rgba(168,85,247,0.1)',
                color: '#a78bfa',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(168,85,247,0.25)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(168,85,247,0.1)' }}
              title="Add child field"
            >
              <Plus size={11} />
            </button>
          )}

          {/* Delete button */}
          <button
            onClick={() => onDelete(node.id)}
            className="flex items-center justify-center rounded cursor-pointer border-none flex-shrink-0 transition-all opacity-0 group-hover:opacity-100"
            style={{
              width: 22,
              height: 22,
              backgroundColor: 'transparent',
              color: 'var(--color-text-secondary)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
            title="Delete field"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Children */}
      <AnimatePresence>
        {hasChildren && expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                marginLeft: `${depth * 14 + 16}px`,
                borderLeft: '1px dashed rgba(255,255,255,0.08)',
              }}
            >
              {node.children.map((child) => (
                <SchemaRow
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  onUpdate={(updated) => updateChild(child.id, updated)}
                  onDelete={deleteChild}
                  onAddChild={addChild}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function SchemaBuilderTree({ schema, onSchemaChange, format, onGenerate }) {
  const updateRoot = useCallback((index, updatedNode) => {
    const newSchema = [...schema]
    newSchema[index] = updatedNode
    onSchemaChange(newSchema)
  }, [schema, onSchemaChange])

  const deleteRoot = useCallback((id) => {
    onSchemaChange(schema.filter((n) => n.id !== id))
  }, [schema, onSchemaChange])

  const addRootNode = useCallback(() => {
    onSchemaChange([...schema, createEmptyNode()])
  }, [schema, onSchemaChange])

  const handleGenerate = useCallback(() => {
    const payload = generatePayloadFromSchema(schema, format)
    onGenerate(payload)
  }, [schema, format, onGenerate])

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          onClick={addRootNode}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md cursor-pointer border-none text-[11px] font-medium transition-all"
          style={{
            backgroundColor: 'rgba(168,85,247,0.1)',
            color: '#a78bfa',
            border: '1px solid rgba(168,85,247,0.2)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(168,85,247,0.18)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(168,85,247,0.1)' }}
        >
          <Plus size={11} /> Add field
        </button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>
            {schema.length} root{schema.length !== 1 ? 's' : ''}
          </span>
          <motion.button
            onClick={handleGenerate}
            disabled={schema.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md cursor-pointer border-none text-[11px] font-semibold disabled:opacity-30 disabled:cursor-not-allowed text-white"
            style={{
              background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
              boxShadow: schema.length > 0 ? '0 2px 8px rgba(168,85,247,0.3)' : 'none',
            }}
            whileHover={schema.length > 0 ? { scale: 1.03 } : {}}
            whileTap={schema.length > 0 ? { scale: 0.97 } : {}}
          >
            <Sparkles size={11} /> Generate {format === 'xml' ? 'XML' : 'JSON'}
          </motion.button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 min-h-0 overflow-y-auto py-2" style={{ position: 'relative' }}>
        {schema.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div
              className="flex items-center justify-center rounded-full mb-3"
              style={{
                width: 44,
                height: 44,
                backgroundColor: 'rgba(168,85,247,0.06)',
                border: '1px solid rgba(168,85,247,0.15)',
              }}
            >
              <Sparkles size={18} style={{ color: '#a78bfa', opacity: 0.7 }} />
            </div>
            <div className="text-[12px] font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
              Build your schema visually
            </div>
            <div className="text-[10.5px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>
              Click "Add field" to start designing
            </div>
          </div>
        ) : (
          schema.map((node, i) => (
            <SchemaRow
              key={node.id}
              node={node}
              depth={0}
              onUpdate={(updated) => updateRoot(i, updated)}
              onDelete={deleteRoot}
              onAddChild={() => {}}
            />
          ))
        )}
      </div>
    </div>
  )
}
