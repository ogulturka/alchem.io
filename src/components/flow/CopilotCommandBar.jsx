import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, ArrowRight, Check, AlertCircle } from 'lucide-react'
import useAppStore from '../../store/useAppStore'

// ── NLP Engine: parse natural-language commands into graph operations ──

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
  const cmd = command.toLowerCase().trim()

  // ── Rule: Concat ──
  // "name + surname = fullName" or "concat name and surname to fullName"
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
        return {
          operation: 'concat',
          inputs: { a: srcA, b: srcB },
          output: tgt,
          description: `Concat ${m[1]} + ${m[2]} → ${m[3]}`,
        }
      }
      return { error: `Could not find fields: ${!srcA ? m[1] : ''} ${!srcB ? m[2] : ''} ${!tgt ? m[3] : ''}`.trim() }
    }
  }

  // ── Rule: Uppercase ──
  // "uppercase name to fullName" or "make city uppercase as cityName"
  const upperPatterns = [
    /(?:uppercase|upper|upper-case|toupper)\s+(\w+)\s+(?:to|=|into|as|→)\s+(\w+)/i,
    /(?:make|convert)\s+(\w+)\s+(?:uppercase|upper)\s+(?:to|=|into|as|→)\s+(\w+)/i,
    /(\w+)\s+(?:to|=|→)\s+(?:uppercase|upper)\s+(?:to|=|into|as|→)\s+(\w+)/i,
  ]
  for (const re of upperPatterns) {
    const m = command.match(re)
    if (m) {
      const src = findFieldHandle(nodes, m[1], 'source-payload')
      const tgt = findFieldHandle(nodes, m[2], 'target-payload')
      if (src && tgt) {
        return {
          operation: 'uppercase',
          inputs: { input: src },
          output: tgt,
          description: `Uppercase ${m[1]} → ${m[2]}`,
        }
      }
      return { error: `Could not find fields: ${!src ? m[1] : ''} ${!tgt ? m[2] : ''}`.trim() }
    }
  }

  // ── Rule: Substring ──
  // "substring name 0 5 to code" or "first 5 chars of name to code"
  const subPatterns = [
    /(?:substring|substr|slice)\s+(\w+)\s+(\d+)\s+(\d+)\s+(?:to|=|into|as|→)\s+(\w+)/i,
    /(?:first|take)\s+(\d+)\s+(?:chars?|characters?)\s+(?:of|from)\s+(\w+)\s+(?:to|=|into|as|→)\s+(\w+)/i,
  ]
  for (const re of subPatterns) {
    const m = command.match(re)
    if (m) {
      let src, tgt, start, length
      if (m.length === 5) {
        // substring name 0 5 to code
        src = findFieldHandle(nodes, m[1], 'source-payload')
        start = Number(m[2])
        length = Number(m[3])
        tgt = findFieldHandle(nodes, m[4], 'target-payload')
      } else {
        // first 5 chars of name to code
        length = Number(m[1])
        start = 0
        src = findFieldHandle(nodes, m[2], 'source-payload')
        tgt = findFieldHandle(nodes, m[3], 'target-payload')
      }
      if (src && tgt) {
        return {
          operation: 'substring',
          inputs: { source: src },
          output: tgt,
          nodeData: { substringStart: start, substringLength: length },
          description: `Substring ${src.split('.').pop()}[${start}:${start + length}] → ${tgt.split('.').pop()}`,
        }
      }
      return { error: 'Could not find matching source/target fields.' }
    }
  }

  // ── Rule: Replace ──
  // "replace '-' with '/' in date to formattedDate"
  const replacePattern = /replace\s+["']([^"']+)["']\s+(?:with|by)\s+["']([^"']*)["']\s+(?:in|from)\s+(\w+)\s+(?:to|=|into|as|→)\s+(\w+)/i
  {
    const m = command.match(replacePattern)
    if (m) {
      const search = m[1], repl = m[2]
      const src = findFieldHandle(nodes, m[3], 'source-payload')
      const tgt = findFieldHandle(nodes, m[4], 'target-payload')
      if (src && tgt) {
        return {
          operation: 'replace',
          inputs: { source: src },
          output: tgt,
          nodeData: { searchFor: search, replaceWith: repl },
          description: `Replace "${search}" → "${repl}" in ${m[3]}`,
        }
      }
      return { error: 'Could not find matching source/target fields.' }
    }
  }

  // ── Rule: Direct map ──
  // "map name to fullName" or "name → fullName" or "name = fullName"
  const mapPatterns = [
    /(?:map|connect|link|wire)\s+(\w+)\s+(?:to|=|into|as|→)\s+(\w+)/i,
    /^(\w+)\s*(?:→|=>|->|=)\s*(\w+)$/i,
  ]
  for (const re of mapPatterns) {
    const m = command.match(re)
    if (m) {
      const src = findFieldHandle(nodes, m[1], 'source-payload')
      const tgt = findFieldHandle(nodes, m[2], 'target-payload')
      if (src && tgt) {
        return {
          operation: 'direct',
          inputs: { source: src },
          output: tgt,
          description: `Map ${m[1]} → ${m[2]}`,
        }
      }
      return { error: `Could not find fields: ${!src ? m[1] : ''} ${!tgt ? m[2] : ''}`.trim() }
    }
  }

  // ── Rule: FormatDate ──
  // "format date to formattedDate as MM/dd/yyyy"
  const datePattern = /(?:format|formatdate|format-date)\s+(\w+)\s+(?:to|=|into|as|→)\s+(\w+)(?:\s+(?:as|format|in)\s+(.+))?/i
  {
    const m = command.match(datePattern)
    if (m) {
      const src = findFieldHandle(nodes, m[1], 'source-payload')
      const tgt = findFieldHandle(nodes, m[2], 'target-payload')
      const fmt = m[3]?.trim() || 'yyyy-MM-dd'
      if (src && tgt) {
        return {
          operation: 'formatDate',
          inputs: { input: src },
          output: tgt,
          nodeData: { format: fmt },
          description: `FormatDate ${m[1]} → ${m[2]} (${fmt})`,
        }
      }
      return { error: 'Could not find matching source/target fields.' }
    }
  }

  // ── Rule: Constant ──
  // "set constant 'hello' to version"
  const constPattern = /(?:set\s+)?(?:constant|const|value|literal)\s+["']([^"']+)["']\s+(?:to|=|into|as|→)\s+(\w+)/i
  {
    const m = command.match(constPattern)
    if (m) {
      const tgt = findFieldHandle(nodes, m[2], 'target-payload')
      if (tgt) {
        return {
          operation: 'constant',
          inputs: {},
          output: tgt,
          nodeData: { constantValue: m[1] },
          description: `Constant "${m[1]}" → ${m[2]}`,
        }
      }
      return { error: `Target field "${m[2]}" not found.` }
    }
  }

  return { error: 'Could not understand the command. Try: "name + surname = fullName" or "uppercase city to cityName"' }
}

// ── Execute the parsed command on the store ──

let copilotIdCounter = 1

function executeCommand(parsed, get, set) {
  const { nodes, edges } = get()

  if (parsed.operation === 'direct') {
    // Direct mapping — just an edge, no transform node
    const newEdge = {
      id: `copilot-edge-${copilotIdCounter++}`,
      source: 'source-payload',
      sourceHandle: parsed.inputs.source,
      target: 'target-payload',
      targetHandle: parsed.output,
      type: 'smoothstep',
      animated: true,
    }
    set({ edges: [...edges, newEdge] })
    return
  }

  // Find a good position for the new node (center between source and target)
  const sourceNode = nodes.find((n) => n.id === 'source-payload')
  const targetNode = nodes.find((n) => n.id === 'target-payload')
  const midX = ((sourceNode?.position?.x || 0) + (targetNode?.position?.x || 750)) / 2
  const baseY = Math.max(...nodes.filter((n) => n.type === 'transform').map((n) => n.position.y), 0) + 120

  // Create transform node
  const nodeId = `copilot-${parsed.operation}-${copilotIdCounter++}`
  const defaults = {
    substring: { substringStart: 0, substringLength: 5 },
    formatDate: { format: 'yyyy-MM-dd' },
    math: { mathOperator: '+' },
  }
  const nodeData = {
    operation: parsed.operation,
    ...(defaults[parsed.operation] || {}),
    ...(parsed.nodeData || {}),
  }
  const newNode = {
    id: nodeId,
    type: 'transform',
    position: { x: midX, y: baseY },
    data: nodeData,
  }

  // Create edges: source → transform inputs
  const newEdges = []
  for (const [handleName, sourcePath] of Object.entries(parsed.inputs)) {
    newEdges.push({
      id: `copilot-edge-${copilotIdCounter++}`,
      source: 'source-payload',
      sourceHandle: sourcePath,
      target: nodeId,
      targetHandle: `in-${handleName}`,
      type: 'smoothstep',
      animated: true,
    })
  }

  // Create edge: transform output → target
  newEdges.push({
    id: `copilot-edge-${copilotIdCounter++}`,
    source: nodeId,
    sourceHandle: 'out-result',
    target: 'target-payload',
    targetHandle: parsed.output,
    type: 'smoothstep',
    animated: true,
  })

  set({
    nodes: [...nodes, newNode],
    edges: [...edges, ...newEdges],
  })
}

// ── Component ──

export default function CopilotCommandBar() {
  const [command, setCommand] = useState('')
  const [status, setStatus] = useState(null) // null | { type: 'success'|'error', message }
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (status) {
      const t = setTimeout(() => setStatus(null), 3500)
      return () => clearTimeout(t)
    }
  }, [status])

  const handleSubmit = useCallback(() => {
    if (!command.trim()) return

    const nodes = useAppStore.getState().nodes
    const parsed = parseCommand(command, nodes)

    if (parsed.error) {
      setStatus({ type: 'error', message: parsed.error })
      return
    }

    executeCommand(parsed, useAppStore.getState, useAppStore.setState)
    setStatus({ type: 'success', message: parsed.description })
    setCommand('')
  }, [command])

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
      {/* Status Toast */}
      <AnimatePresence>
        {status && (
          <motion.div
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-semibold"
            style={{
              backgroundColor: status.type === 'success'
                ? 'rgba(34,197,94,0.12)'
                : 'rgba(239,68,68,0.12)',
              color: status.type === 'success' ? '#22c55e' : '#ef4444',
              backdropFilter: 'blur(12px)',
              border: `1px solid ${status.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            {status.type === 'success' ? <Check size={13} /> : <AlertCircle size={13} />}
            {status.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Command Bar */}
      <motion.div
        className="relative flex items-center rounded-2xl overflow-hidden"
        style={{
          width: 520,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(20px)',
          border: `1.5px solid ${isFocused ? 'var(--color-accent)' : 'var(--color-border)'}`,
          boxShadow: isFocused
            ? '0 0 30px var(--color-accent-glow), 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)'
            : '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.03)',
          transition: 'border-color 0.3s, box-shadow 0.3s',
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 25 }}
      >
        {/* Sparkle Icon */}
        <div className="flex items-center justify-center pl-4 pr-1">
          <Sparkles
            size={16}
            style={{ color: isFocused ? 'var(--color-accent-glow)' : 'var(--color-text-secondary)' }}
          />
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder='AI Copilot — try "name + surname = fullName"'
          className="flex-1 bg-transparent border-none outline-none text-[13px] font-mono py-3.5 px-2"
          style={{ color: 'var(--color-text-primary)', caretColor: 'var(--color-accent-glow)' }}
        />

        {/* Send Button */}
        <motion.button
          onClick={handleSubmit}
          disabled={!command.trim()}
          className="flex items-center justify-center mr-2 rounded-xl cursor-pointer disabled:opacity-30 disabled:cursor-default"
          style={{
            width: 36,
            height: 36,
            background: command.trim()
              ? 'linear-gradient(135deg, var(--color-accent), var(--color-accent-glow))'
              : 'rgba(255,255,255,0.05)',
            border: 'none',
          }}
          whileHover={command.trim() ? { scale: 1.1 } : {}}
          whileTap={command.trim() ? { scale: 0.9 } : {}}
        >
          <ArrowRight size={16} color="white" />
        </motion.button>
      </motion.div>
    </div>
  )
}
