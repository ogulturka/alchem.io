import { Handle, Position } from '@xyflow/react'
import { motion } from 'framer-motion'
import {
  Merge, CaseSensitive, Calendar, Hash, GitBranch, Replace,
  Calculator, Scissors, Equal,
} from 'lucide-react'
import useAppStore from '../../store/useAppStore'

// ── Category + Operation Config ──

const categories = {
  string: { label: 'String', color: 'var(--color-cat-string)', glow: 'var(--color-cat-string-glow)', bg: 'var(--color-cat-string-bg)' },
  logic:  { label: 'Logic',  color: 'var(--color-cat-logic)',  glow: 'var(--color-cat-logic-glow)',  bg: 'var(--color-cat-logic-bg)' },
  data:   { label: 'Data',   color: 'var(--color-cat-data)',   glow: 'var(--color-cat-data-glow)',   bg: 'var(--color-cat-data-bg)' },
}

export const operationConfig = {
  concat: {
    label: 'Concat',
    icon: Merge,
    category: 'string',
    inputs: ['a', 'b'],
    outputs: ['result'],
    description: 'Join two values',
  },
  uppercase: {
    label: 'UpperCase',
    icon: CaseSensitive,
    category: 'string',
    inputs: ['input'],
    outputs: ['result'],
    description: 'Convert to uppercase',
  },
  replace: {
    label: 'Replace',
    icon: Replace,
    category: 'string',
    inputs: ['source', 'search'],
    outputs: ['result'],
    description: 'Find and replace text',
    internalFields: ['replaceWith'],
  },
  ifelse: {
    label: 'IfElse',
    icon: GitBranch,
    category: 'logic',
    inputs: ['condition', 'true', 'false'],
    outputs: ['result'],
    description: 'Conditional branch',
  },
  constant: {
    label: 'Constant',
    icon: Hash,
    category: 'data',
    inputs: [],
    outputs: ['result'],
    description: 'Hardcoded value',
    hasInlineInput: true,
  },
  formatDate: {
    label: 'FormatDate',
    icon: Calendar,
    category: 'data',
    inputs: ['input'],
    outputs: ['result'],
    description: 'Format date string',
  },
  math: {
    label: 'Math',
    icon: Calculator,
    category: 'data',
    inputs: ['a', 'b'],
    outputs: ['result'],
    description: 'Arithmetic operation',
    hasOperatorSelect: true,
  },
  substring: {
    label: 'Substring',
    icon: Scissors,
    category: 'string',
    inputs: ['source', 'start', 'length'],
    outputs: ['result'],
    description: 'Extract part of text',
  },
  equals: {
    label: 'Equals',
    icon: Equal,
    category: 'logic',
    inputs: ['valueA', 'valueB'],
    outputs: ['result'],
    description: 'Compare two values',
  },
}

// ── Styled Handle ──

function NodeHandle({ type, position, id, color, glow, label, side }) {
  return (
    <div
      className="flex items-center gap-2 relative py-[5px]"
      style={{ paddingLeft: side === 'left' ? 16 : 10, paddingRight: side === 'right' ? 16 : 10 }}
    >
      <Handle
        type={type}
        position={position}
        id={id}
        style={{
          width: 9,
          height: 9,
          backgroundColor: type === 'target' ? 'transparent' : color,
          border: `2px solid ${color}`,
          boxShadow: `0 0 6px ${glow}`,
          ...(side === 'left' ? { left: -4 } : { right: -4 }),
        }}
      />
      {side === 'left' && (
        <>
          <span className="text-[9px] font-mono font-medium" style={{ color: glow }}>{label}</span>
          <span className="text-[8px] px-1 rounded-sm ml-auto font-mono" style={{ color, backgroundColor: 'rgba(255,255,255,0.04)' }}>IN</span>
        </>
      )}
      {side === 'right' && (
        <>
          <span className="text-[8px] px-1 rounded-sm font-mono" style={{ color: glow, backgroundColor: 'rgba(255,255,255,0.04)' }}>OUT</span>
          <span className="text-[9px] font-mono font-medium ml-auto" style={{ color: glow }}>{label}</span>
        </>
      )}
    </div>
  )
}

// ── Main Component ──

export default function TransformNode({ id, data }) {
  const config = operationConfig[data.operation]
  if (!config) return null

  const cat = categories[config.category]
  const Icon = config.icon
  const updateNodeData = useAppStore((s) => s.updateNodeData)

  return (
    <motion.div
      className="rounded-2xl border overflow-hidden"
      style={{
        backgroundColor: 'var(--color-bg-tertiary)',
        borderColor: cat.color,
        minWidth: 200,
        boxShadow: `0 4px 24px ${cat.bg}, 0 0 12px ${cat.bg}, inset 0 1px 0 rgba(255,255,255,0.03)`,
      }}
      whileHover={{
        scale: 1.04,
        boxShadow: `0 0 24px ${cat.glow}, 0 0 48px ${cat.bg}`,
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* ── Header: Microchip style ── */}
      <div
        className="flex items-center gap-3 px-4 py-2.5"
        style={{
          background: `linear-gradient(135deg, ${cat.color}, ${cat.glow})`,
        }}
      >
        <div
          className="flex items-center justify-center rounded-lg"
          style={{ width: 24, height: 24, backgroundColor: 'rgba(0,0,0,0.2)' }}
        >
          <Icon size={13} color="white" strokeWidth={2.5} />
        </div>
        <span className="text-[11px] font-bold text-white uppercase tracking-widest">
          {config.label}
        </span>
        <span
          className="text-[8px] font-bold uppercase tracking-wider ml-auto px-2 py-1 rounded-full"
          style={{ backgroundColor: 'rgba(0,0,0,0.25)', color: 'rgba(255,255,255,0.8)' }}
        >
          {cat.label}
        </span>
      </div>

      {/* ── Circuit line accent ── */}
      <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${cat.glow}, transparent)`, opacity: 0.5 }} />

      {/* ── Body ── */}
      <div className="px-2 py-3 flex flex-col gap-1">
        {/* Inputs */}
        {config.inputs.map((input) => (
          <NodeHandle
            key={input}
            type="target"
            position={Position.Left}
            id={`in-${input}`}
            color={cat.color}
            glow={cat.glow}
            label={input}
            side="left"
          />
        ))}

        {/* Constant: inline text input */}
        {config.hasInlineInput && (
          <div className="px-4 py-2">
            <input
              type="text"
              placeholder="Enter value..."
              value={data.constantValue || ''}
              onChange={(e) => updateNodeData(id, { constantValue: e.target.value })}
              className="w-full text-[11px] font-mono px-3 py-2 rounded-lg border outline-none focus:ring-1"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: cat.color,
                color: 'var(--color-text-primary)',
                boxShadow: `0 0 0 0px ${cat.glow}`,
                transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
              }}
              onFocus={(e) => {
                e.target.style.boxShadow = `0 0 8px ${cat.glow}`
                e.target.style.borderColor = cat.glow
              }}
              onBlur={(e) => {
                e.target.style.boxShadow = `0 0 0 0px ${cat.glow}`
                e.target.style.borderColor = cat.color
              }}
            />
          </div>
        )}

        {/* Replace: internal "Replace With" field */}
        {config.internalFields?.includes('replaceWith') && (
          <div className="px-4 py-2">
            <label className="text-[9px] font-mono uppercase tracking-wider block mb-1.5" style={{ color: cat.glow }}>
              Replace With
            </label>
            <input
              type="text"
              placeholder="replacement..."
              value={data.replaceWith || ''}
              onChange={(e) => updateNodeData(id, { replaceWith: e.target.value })}
              className="w-full text-[11px] font-mono px-3 py-2 rounded-lg border outline-none focus:ring-1"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: cat.color,
                color: 'var(--color-text-primary)',
              }}
            />
          </div>
        )}

        {/* Math: operator select */}
        {config.hasOperatorSelect && (
          <div className="px-4 py-2">
            <label className="text-[9px] font-mono uppercase tracking-wider block mb-1.5" style={{ color: cat.glow }}>
              Operator
            </label>
            <select
              value={data.mathOperator || '+'}
              onChange={(e) => updateNodeData(id, { mathOperator: e.target.value })}
              className="w-full text-[11px] font-mono px-3 py-2 rounded-lg border outline-none cursor-pointer"
              style={{
                backgroundColor: 'var(--color-bg-primary)',
                borderColor: cat.color,
                color: 'var(--color-text-primary)',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 6px center',
                paddingRight: '24px',
              }}
            >
              <option value="+">+ Add</option>
              <option value="-">- Subtract</option>
              <option value="*">* Multiply</option>
              <option value="/">/  Divide</option>
            </select>
          </div>
        )}

        {/* Divider */}
        {config.outputs.length > 0 && (
          <div className="mx-3 my-1" style={{ height: 1, background: `linear-gradient(90deg, transparent, ${cat.color}, transparent)`, opacity: 0.3 }} />
        )}

        {/* Outputs */}
        {config.outputs.map((output) => (
          <NodeHandle
            key={output}
            type="source"
            position={Position.Right}
            id={`out-${output}`}
            color={cat.color}
            glow={cat.glow}
            label={output}
            side="right"
          />
        ))}
      </div>

      {/* ── Footer ── */}
      <div
        className="px-4 py-2 border-t"
        style={{ borderColor: `color-mix(in srgb, ${cat.color} 30%, transparent)`, backgroundColor: cat.bg }}
      >
        <span className="text-[9px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
          {config.description}
        </span>
      </div>
    </motion.div>
  )
}
