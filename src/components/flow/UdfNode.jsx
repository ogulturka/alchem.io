import { Handle, Position } from '@xyflow/react'
import { motion } from 'framer-motion'
import { Braces } from 'lucide-react'

const CAT = {
  color: 'var(--color-cat-logic)',
  glow: 'var(--color-cat-logic-glow)',
  bg: 'var(--color-cat-logic-bg)',
}

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
          width: 12, height: 12,
          backgroundColor: type === 'target' ? 'transparent' : color,
          border: `2.5px solid ${color}`,
          boxShadow: `0 0 8px ${glow}`,
          zIndex: 50,
          ...(side === 'left' ? { left: -6 } : { right: -6 }),
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

export default function UdfNode({ id, data }) {
  const { name, args = [], code, __ghost } = data
  const isGhost = __ghost === true

  return (
    <motion.div
      className="rounded-xl border"
      style={{
        backgroundColor: 'var(--color-bg-tertiary)',
        borderColor: isGhost ? '#a855f7' : CAT.color,
        borderStyle: isGhost ? 'dashed' : 'solid',
        borderWidth: isGhost ? 2 : 1,
        minWidth: 200,
        opacity: isGhost ? 0.55 : 1,
        boxShadow: isGhost
          ? '0 0 20px rgba(168,85,247,0.3)'
          : `0 4px 24px ${CAT.bg}, 0 0 12px ${CAT.bg}, inset 0 1px 0 rgba(255,255,255,0.03)`,
        pointerEvents: isGhost ? 'none' : 'auto',
      }}
      whileHover={isGhost ? {} : {
        scale: 1.04,
        boxShadow: `0 0 24px ${CAT.glow}, 0 0 48px ${CAT.bg}`,
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 rounded-t-xl"
        style={{ background: `linear-gradient(135deg, ${CAT.color}, ${CAT.glow})` }}
      >
        <div className="flex items-center justify-center rounded-lg" style={{ width: 24, height: 24, backgroundColor: 'rgba(0,0,0,0.2)' }}>
          <Braces size={13} color="white" strokeWidth={2.5} />
        </div>
        <span className="text-[11px] font-bold text-white uppercase tracking-widest">
          {name || 'UDF'}
        </span>
        <span className="text-[8px] font-bold uppercase tracking-wider ml-auto px-2 py-1 rounded-md" style={{ backgroundColor: 'rgba(0,0,0,0.25)', color: 'rgba(255,255,255,0.8)' }}>
          Custom
        </span>
      </div>

      {/* Circuit line */}
      <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${CAT.glow}, transparent)`, opacity: 0.5 }} />

      {/* Body: dynamic argument handles */}
      <div className="px-2 py-3 flex flex-col gap-1">
        {args.map((arg) => (
          <NodeHandle
            key={arg}
            type="target"
            position={Position.Left}
            id={`in-${arg}`}
            color={CAT.color}
            glow={CAT.glow}
            label={arg}
            side="left"
          />
        ))}

        {/* Divider */}
        <div className="mx-3 my-1" style={{ height: 1, background: `linear-gradient(90deg, transparent, ${CAT.color}, transparent)`, opacity: 0.3 }} />

        {/* Output handle */}
        <NodeHandle
          type="source"
          position={Position.Right}
          id="out-result"
          color={CAT.color}
          glow={CAT.glow}
          label="result"
          side="right"
        />
      </div>

      {/* Footer: code preview */}
      <div
        className="px-4 py-2 border-t rounded-b-xl"
        style={{ borderColor: `color-mix(in srgb, ${CAT.color} 30%, transparent)`, backgroundColor: CAT.bg }}
      >
        <span className="text-[9px] font-mono truncate block" style={{ color: 'var(--color-text-secondary)', maxWidth: 180 }}>
          {code ? `${code.substring(0, 40)}${code.length > 40 ? '...' : ''}` : 'No code defined'}
        </span>
      </div>
    </motion.div>
  )
}
