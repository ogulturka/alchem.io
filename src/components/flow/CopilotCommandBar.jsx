import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ArrowRight, Check, AlertCircle } from 'lucide-react'
import useAppStore from '../../store/useAppStore'

// ── NLP Engine ──

function findFieldHandle(nodes, fieldName, payloadId) {
  const payload = nodes.find((n) => n.id === payloadId)
  if (!payload?.data?.tree) return null
  const lower = fieldName.toLowerCase()

  function searchTree(items, parentPath) {
    for (const item of items) {
      const field = item.field || item.label || ''
      const path = parentPath ? `${parentPath}.${field}` : field
      if (field.toLowerCase() === lower) return path
      if (item.children) {
        const found = searchTree(item.children, path)
        if (found) return found
      }
    }
    return null
  }
  return searchTree(payload.data.tree, '')
}

function parseCommand(command, nodes) {
  // ── Concat ──
  const concatPatterns = [
    /(\w+)\s*\+\s*(\w+)\s*=\s*(\w+)/i,
    /concat\s+(\w+)\s+(?:and|&|with)\s+(\w+)\s+(?:to|=|into|as)\s+(\w+)/i,
    /(?:combine|merge|join)\s+(\w+)\s+(?:and|&|with)\s+(\w+)\s+(?:to|=|into|as)\s+(\w+)/i,
  ]
  for (const re of concatPatterns) {
    const m = command.match(re)
    if (m) {
      const srcA = findFieldHandle(nodes, m[1], 'source-payload')
      const srcB = findFieldHandle(nodes, m[2], 'source-payload')
      const tgt = findFieldHandle(nodes, m[3], 'target-payload')
      if (srcA && srcB && tgt) {
        return { operation: 'concat', inputs: { a: srcA, b: srcB }, output: tgt, description: `Concat ${m[1]} + ${m[2]} → ${m[3]}` }
      }
      return { error: `Could not find fields: ${!srcA ? m[1] : ''} ${!srcB ? m[2] : ''} ${!tgt ? m[3] : ''}`.trim() }
    }
  }

  // ── Uppercase ──
  const upperPatterns = [
    /(?:uppercase|upper|upper-case|toupper)\s+(\w+)\s+(?:to|=|into|as|→)\s+(\w+)/i,
    /(?:make|convert)\s+(\w+)\s+(?:uppercase|upper)\s+(?:to|=|into|as|→)\s+(\w+)/i,
  ]
  for (const re of upperPatterns) {
    const m = command.match(re)
    if (m) {
      const src = findFieldHandle(nodes, m[1], 'source-payload')
      const tgt = findFieldHandle(nodes, m[2], 'target-payload')
      if (src && tgt) return { operation: 'uppercase', inputs: { input: src }, output: tgt, description: `Uppercase ${m[1]} → ${m[2]}` }
      return { error: `Could not find fields: ${!src ? m[1] : ''} ${!tgt ? m[2] : ''}`.trim() }
    }
  }

  // ── Substring ──
  const subPatterns = [
    /(?:substring|substr|slice)\s+(\w+)\s+(\d+)\s+(\d+)\s+(?:to|=|into|as|→)\s+(\w+)/i,
    /(?:first|take)\s+(\d+)\s+(?:chars?|characters?)\s+(?:of|from)\s+(\w+)\s+(?:to|=|into|as|→)\s+(\w+)/i,
  ]
  for (const re of subPatterns) {
    const m = command.match(re)
    if (m) {
      let src, tgt, start, length
      if (m.length === 5) { src = findFieldHandle(nodes, m[1], 'source-payload'); start = Number(m[2]); length = Number(m[3]); tgt = findFieldHandle(nodes, m[4], 'target-payload') }
      else { length = Number(m[1]); start = 0; src = findFieldHandle(nodes, m[2], 'source-payload'); tgt = findFieldHandle(nodes, m[3], 'target-payload') }
      if (src && tgt) return { operation: 'substring', inputs: { source: src }, output: tgt, nodeData: { substringStart: start, substringLength: length }, description: `Substring [${start}:${start + length}]` }
      return { error: 'Could not find matching source/target fields.' }
    }
  }

  // ── Replace ──
  const replacePattern = /replace\s+["']([^"']+)["']\s+(?:with|by)\s+["']([^"']*)["']\s+(?:in|from)\s+(\w+)\s+(?:to|=|into|as|→)\s+(\w+)/i
  { const m = command.match(replacePattern)
    if (m) {
      const src = findFieldHandle(nodes, m[3], 'source-payload'); const tgt = findFieldHandle(nodes, m[4], 'target-payload')
      if (src && tgt) return { operation: 'replace', inputs: { source: src }, output: tgt, nodeData: { searchFor: m[1], replaceWith: m[2] }, description: `Replace "${m[1]}" → "${m[2]}"` }
      return { error: 'Could not find matching source/target fields.' }
    }
  }

  // ── Direct map ──
  const mapPatterns = [
    /(?:map|connect|link|wire)\s+(\w+)\s+(?:to|=|into|as|→)\s+(\w+)/i,
    /^(\w+)\s*(?:→|=>|->|=)\s*(\w+)$/i,
  ]
  for (const re of mapPatterns) {
    const m = command.match(re)
    if (m) {
      const src = findFieldHandle(nodes, m[1], 'source-payload'); const tgt = findFieldHandle(nodes, m[2], 'target-payload')
      if (src && tgt) return { operation: 'direct', inputs: { source: src }, output: tgt, description: `Map ${m[1]} → ${m[2]}` }
      return { error: `Could not find fields: ${!src ? m[1] : ''} ${!tgt ? m[2] : ''}`.trim() }
    }
  }

  // ── FormatDate ──
  const datePattern = /(?:format|formatdate|format-date)\s+(\w+)\s+(?:to|=|into|as|→)\s+(\w+)(?:\s+(?:as|format|in)\s+(.+))?/i
  { const m = command.match(datePattern)
    if (m) {
      const src = findFieldHandle(nodes, m[1], 'source-payload'); const tgt = findFieldHandle(nodes, m[2], 'target-payload')
      if (src && tgt) return { operation: 'formatDate', inputs: { input: src }, output: tgt, nodeData: { format: m[3]?.trim() || 'yyyy-MM-dd' }, description: `FormatDate → ${m[2]}` }
      return { error: 'Could not find matching source/target fields.' }
    }
  }

  // ── Constant ──
  const constPattern = /(?:set\s+)?(?:constant|const|value|literal)\s+["']([^"']+)["']\s+(?:to|=|into|as|→)\s+(\w+)/i
  { const m = command.match(constPattern)
    if (m) {
      const tgt = findFieldHandle(nodes, m[2], 'target-payload')
      if (tgt) return { operation: 'constant', inputs: {}, output: tgt, nodeData: { constantValue: m[1] }, description: `Constant "${m[1]}" → ${m[2]}` }
      return { error: `Target field "${m[2]}" not found.` }
    }
  }

  return { error: 'Could not understand the command. Try: "name + surname = fullName" or "uppercase city to cityName"' }
}

// ── Build ghost elements from a parsed command ──

let ghostIdCounter = 1

function buildGhostElements(parsed, nodes) {
  const ghostNodes = []
  const ghostEdges = []

  if (parsed.operation === 'direct') {
    ghostEdges.push({
      id: `ghost-edge-${ghostIdCounter++}`,
      source: 'source-payload',
      sourceHandle: parsed.inputs.source,
      target: 'target-payload',
      targetHandle: parsed.output,
      type: 'smoothstep',
      animated: true,
      data: { __ghost: true },
    })
    return { ghostNodes, ghostEdges }
  }

  const sourceNode = nodes.find((n) => n.id === 'source-payload')
  const targetNode = nodes.find((n) => n.id === 'target-payload')
  const midX = ((sourceNode?.position?.x || 0) + (targetNode?.position?.x || 750)) / 2
  const transformNodes = nodes.filter((n) => n.type === 'transform')
  const baseY = transformNodes.length > 0
    ? Math.max(...transformNodes.map((n) => n.position.y)) + 120
    : 100

  const nodeId = `ghost-${parsed.operation}-${ghostIdCounter++}`
  const defaults = { substring: { substringStart: 0, substringLength: 5 }, formatDate: { format: 'yyyy-MM-dd' }, math: { mathOperator: '+' } }

  ghostNodes.push({
    id: nodeId,
    type: 'transform',
    position: { x: midX, y: baseY },
    data: {
      operation: parsed.operation,
      ...(defaults[parsed.operation] || {}),
      ...(parsed.nodeData || {}),
      __ghost: true,
    },
  })

  for (const [handleName, sourcePath] of Object.entries(parsed.inputs)) {
    ghostEdges.push({
      id: `ghost-edge-${ghostIdCounter++}`,
      source: 'source-payload',
      sourceHandle: sourcePath,
      target: nodeId,
      targetHandle: `in-${handleName}`,
      type: 'smoothstep',
      animated: true,
      data: { __ghost: true },
    })
  }

  ghostEdges.push({
    id: `ghost-edge-${ghostIdCounter++}`,
    source: nodeId,
    sourceHandle: 'out-result',
    target: 'target-payload',
    targetHandle: parsed.output,
    type: 'smoothstep',
    animated: true,
    data: { __ghost: true },
  })

  return { ghostNodes, ghostEdges }
}

// ── Component ──

export default function CopilotCommandBar({ ghostState, setGhostState }) {
  const [command, setCommand] = useState('')
  const [status, setStatus] = useState(null)
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef(null)

  const isGhostMode = ghostState.active

  useEffect(() => {
    if (status && !isGhostMode) {
      const t = setTimeout(() => setStatus(null), 3500)
      return () => clearTimeout(t)
    }
  }, [status, isGhostMode])

  // Focus input when ghost mode activates for keyboard capture
  useEffect(() => {
    if (isGhostMode && inputRef.current) inputRef.current.focus()
  }, [isGhostMode])

  const handleGenerate = useCallback(() => {
    if (!command.trim()) return

    const nodes = useAppStore.getState().nodes
    const parsed = parseCommand(command, nodes)

    if (parsed.error) {
      setStatus({ type: 'error', message: parsed.error })
      return
    }

    const { ghostNodes, ghostEdges } = buildGhostElements(parsed, nodes)
    setGhostState({ active: true, nodes: ghostNodes, edges: ghostEdges, description: parsed.description })
    setStatus(null)
  }, [command, setGhostState])

  const handleAccept = useCallback(() => {
    const { nodes, edges } = useAppStore.getState()
    // Strip __ghost flag and commit to store
    const permanentNodes = ghostState.nodes.map((n) => {
      const { __ghost, ...rest } = n.data
      return { ...n, id: n.id.replace('ghost-', 'copilot-'), data: rest }
    })
    const permanentEdges = ghostState.edges.map((e) => ({
      ...e,
      id: e.id.replace('ghost-', 'copilot-'),
      source: e.source.startsWith('ghost-') ? e.source.replace('ghost-', 'copilot-') : e.source,
      target: e.target.startsWith('ghost-') ? e.target.replace('ghost-', 'copilot-') : e.target,
      data: undefined,
    }))

    useAppStore.setState({
      nodes: [...nodes, ...permanentNodes],
      edges: [...edges, ...permanentEdges],
    })

    setStatus({ type: 'success', message: ghostState.description })
    setGhostState({ active: false, nodes: [], edges: [], description: '' })
    setCommand('')
  }, [ghostState, setGhostState])

  const handleCancel = useCallback(() => {
    setGhostState({ active: false, nodes: [], edges: [], description: '' })
    setStatus({ type: 'error', message: 'Ghost preview cancelled' })
  }, [setGhostState])

  const onKeyDown = useCallback((e) => {
    if (isGhostMode) {
      if (e.key === 'Enter') { e.preventDefault(); handleAccept() }
      else if (e.key === 'Escape') { e.preventDefault(); handleCancel() }
      return
    }
    if (e.key === 'Enter') { e.preventDefault(); handleGenerate() }
  }, [isGhostMode, handleGenerate, handleAccept, handleCancel])

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
      {/* Status Toast */}
      <AnimatePresence>
        {status && !isGhostMode && (
          <motion.div
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-semibold"
            style={{
              backgroundColor: status.type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              color: status.type === 'success' ? '#22c55e' : '#ef4444',
              backdropFilter: 'blur(12px)',
              border: `1px solid ${status.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
          >
            {status.type === 'success' ? <Check size={13} /> : <AlertCircle size={13} />}
            {status.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ghost Mode Confirmation Badge */}
      <AnimatePresence>
        {isGhostMode && (
          <motion.div
            className="flex items-center gap-3 px-5 py-2.5 rounded-xl text-[11px] font-semibold"
            style={{
              background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(236,72,153,0.15))',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(168,85,247,0.3)',
              color: 'var(--color-text-primary)',
              boxShadow: '0 0 20px rgba(168,85,247,0.2)',
            }}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <Sparkles size={14} style={{ color: '#a855f7' }} />
            <span style={{ color: '#c084fc' }}>{ghostState.description}</span>
            <span style={{ color: 'var(--color-text-secondary)' }}>|</span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>Enter</kbd>
              {' '}Accept
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>Esc</kbd>
              {' '}Cancel
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Command Bar */}
      <motion.div
        className="relative flex items-center rounded-lg overflow-hidden"
        style={{
          width: 520,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(20px)',
          border: `1.5px solid ${isGhostMode ? '#a855f7' : isFocused ? 'var(--color-accent)' : 'var(--color-border)'}`,
          boxShadow: isGhostMode
            ? '0 0 30px rgba(168,85,247,0.4), 0 8px 32px rgba(0,0,0,0.4)'
            : isFocused
              ? '0 0 30px var(--color-accent-glow), 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)'
              : '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
          transition: 'border-color 0.3s, box-shadow 0.3s',
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 25 }}
      >
        <div className="flex items-center justify-center pl-4 pr-1">
          <Sparkles
            size={16}
            style={{ color: isGhostMode ? '#a855f7' : isFocused ? 'var(--color-accent-glow)' : 'var(--color-text-secondary)' }}
          />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => { if (!isGhostMode) setCommand(e.target.value) }}
          onKeyDown={onKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={isGhostMode ? 'Enter to accept, Esc to cancel...' : 'AI Copilot — try "name + surname = fullName"'}
          readOnly={isGhostMode}
          className="flex-1 bg-transparent border-none outline-none text-[13px] font-mono py-3.5 px-2"
          style={{
            color: isGhostMode ? '#c084fc' : 'var(--color-text-primary)',
            caretColor: 'var(--color-accent-glow)',
          }}
        />

        <motion.button
          onClick={isGhostMode ? handleAccept : handleGenerate}
          disabled={!isGhostMode && !command.trim()}
          className="flex items-center justify-center mr-2 rounded-lg cursor-pointer disabled:opacity-30 disabled:cursor-default"
          style={{
            width: 36,
            height: 36,
            background: isGhostMode
              ? 'linear-gradient(135deg, #22c55e, #16a34a)'
              : command.trim()
                ? 'linear-gradient(135deg, var(--color-accent), var(--color-accent-glow))'
                : 'rgba(255,255,255,0.05)',
            border: 'none',
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          {isGhostMode ? <Check size={16} color="white" /> : <ArrowRight size={16} color="white" />}
        </motion.button>
      </motion.div>
    </div>
  )
}
