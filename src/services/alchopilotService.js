// Alchopilot Service — mocked LLM parser.
// Turns natural-language mapping commands into a strict JSON payload the
// executor can apply to the ReactFlow canvas. When we swap in a real LLM,
// only this file needs to change — the contract is fixed.

// ── Strict JSON contract ──
// {
//   intent: 'TRANSFORM_MAP' | 'DIRECT_MAP' | 'CONCAT_MAP' | 'CONSTANT_MAP' | 'UNKNOWN',
//   sourceIds?: string[],      // dot-paths into the source payload tree
//   targetId?: string,         // dot-path into the target payload tree
//   transformType?: string,    // e.g. 'uppercase', 'formatDate', 'concat', 'substring'...
//   params?: object,           // node-data overrides (e.g. { format: 'yyyy-MM-dd' })
//   description?: string,      // human-readable summary for toasts
//   error?: string,            // populated when intent === 'UNKNOWN'
// }

// Walk a payload tree and return the dot-path of a field whose name matches
// (case-insensitive). Searches depth-first; returns the first hit.
function findPathByFieldName(tree, targetName) {
  if (!tree || !Array.isArray(tree)) return null
  const needle = targetName.toLowerCase()

  function walk(items, parentPath) {
    for (const item of items) {
      const name = item.field || item.label || ''
      const path = parentPath ? `${parentPath}.${name}` : name
      if (name.toLowerCase() === needle) return path
      if (item.children) {
        const found = walk(item.children, path)
        if (found) return found
      }
    }
    return null
  }
  return walk(tree, '')
}

function resolveSource(sourceNodes, fieldName) {
  const node = sourceNodes?.find((n) => n.id === 'source-payload')
  if (!node?.data?.tree) return null
  return findPathByFieldName(node.data.tree, fieldName)
}

function resolveTarget(targetNodes, fieldName) {
  const node = targetNodes?.find((n) => n.id === 'target-payload')
  if (!node?.data?.tree) return null
  return findPathByFieldName(node.data.tree, fieldName)
}

// ── Pattern table ──
// Each entry: { regex, build(match, ctx) → payload | null }
const PATTERNS = [
  // ── CONCAT (merge A and B to C) ──
  {
    regex: /(?:merge|concat|combine|join)\s+(\w+)\s+(?:and|&|with)\s+(\w+)\s+(?:to|=|into|as|→)\s+(\w+)/i,
    build: (m, ctx) => {
      const srcA = resolveSource(ctx.sourceNodes, m[1])
      const srcB = resolveSource(ctx.sourceNodes, m[2])
      const tgt = resolveTarget(ctx.targetNodes, m[3])
      if (!srcA || !srcB || !tgt) {
        return {
          intent: 'UNKNOWN',
          error: `Couldn't find: ${[!srcA && m[1], !srcB && m[2], !tgt && m[3]].filter(Boolean).join(', ')}`,
        }
      }
      return {
        intent: 'CONCAT_MAP',
        sourceIds: [srcA, srcB],
        targetId: tgt,
        transformType: 'concat',
        description: `Concat ${m[1]} + ${m[2]} → ${m[3]}`,
      }
    },
  },

  // ── CONCAT (A + B = C shorthand) ──
  {
    regex: /^(\w+)\s*\+\s*(\w+)\s*=\s*(\w+)$/i,
    build: (m, ctx) => {
      const srcA = resolveSource(ctx.sourceNodes, m[1])
      const srcB = resolveSource(ctx.sourceNodes, m[2])
      const tgt = resolveTarget(ctx.targetNodes, m[3])
      if (!srcA || !srcB || !tgt) {
        return {
          intent: 'UNKNOWN',
          error: `Couldn't find: ${[!srcA && m[1], !srcB && m[2], !tgt && m[3]].filter(Boolean).join(', ')}`,
        }
      }
      return {
        intent: 'CONCAT_MAP',
        sourceIds: [srcA, srcB],
        targetId: tgt,
        transformType: 'concat',
        description: `Concat ${m[1]} + ${m[2]} → ${m[3]}`,
      }
    },
  },

  // ── UPPERCASE ──
  {
    regex: /(?:uppercase|upper|upper-case|toupper)\s+(\w+)\s+(?:to|=|into|as|→)\s+(\w+)/i,
    build: (m, ctx) => {
      const src = resolveSource(ctx.sourceNodes, m[1])
      const tgt = resolveTarget(ctx.targetNodes, m[2])
      if (!src || !tgt) {
        return {
          intent: 'UNKNOWN',
          error: `Couldn't find: ${[!src && m[1], !tgt && m[2]].filter(Boolean).join(', ')}`,
        }
      }
      return {
        intent: 'TRANSFORM_MAP',
        sourceIds: [src],
        targetId: tgt,
        transformType: 'uppercase',
        description: `Uppercase ${m[1]} → ${m[2]}`,
      }
    },
  },

  // ── LOWERCASE ──
  {
    regex: /(?:lowercase|lower|lower-case|tolower)\s+(\w+)\s+(?:to|=|into|as|→)\s+(\w+)/i,
    build: (m, ctx) => {
      const src = resolveSource(ctx.sourceNodes, m[1])
      const tgt = resolveTarget(ctx.targetNodes, m[2])
      if (!src || !tgt) return { intent: 'UNKNOWN', error: `Couldn't find: ${[!src && m[1], !tgt && m[2]].filter(Boolean).join(', ')}` }
      return {
        intent: 'TRANSFORM_MAP',
        sourceIds: [src],
        targetId: tgt,
        transformType: 'lowercase',
        description: `Lowercase ${m[1]} → ${m[2]}`,
      }
    },
  },

  // ── FORMAT DATE ──
  {
    regex: /(?:format|formatdate|format-date)\s+(\w+)\s+(?:to|=|into|as|→)\s+(\w+)(?:\s+(?:as|format|in)\s+([^\s]+))?/i,
    build: (m, ctx) => {
      const src = resolveSource(ctx.sourceNodes, m[1])
      const tgt = resolveTarget(ctx.targetNodes, m[2])
      if (!src || !tgt) return { intent: 'UNKNOWN', error: `Couldn't find: ${[!src && m[1], !tgt && m[2]].filter(Boolean).join(', ')}` }
      return {
        intent: 'TRANSFORM_MAP',
        sourceIds: [src],
        targetId: tgt,
        transformType: 'formatDate',
        params: { format: m[3]?.trim() || 'yyyy-MM-dd' },
        description: `FormatDate ${m[1]} → ${m[2]}`,
      }
    },
  },

  // ── CONSTANT ──
  {
    regex: /(?:set\s+)?(?:constant|const|value|literal)\s+["']([^"']+)["']\s+(?:to|=|into|as|→)\s+(\w+)/i,
    build: (m, ctx) => {
      const tgt = resolveTarget(ctx.targetNodes, m[2])
      if (!tgt) return { intent: 'UNKNOWN', error: `Target "${m[2]}" not found` }
      return {
        intent: 'CONSTANT_MAP',
        targetId: tgt,
        transformType: 'constant',
        params: { constantValue: m[1] },
        description: `Constant "${m[1]}" → ${m[2]}`,
      }
    },
  },

  // ── DIRECT MAP (map X to Y / X → Y) ──
  {
    regex: /(?:map|connect|link|wire)\s+(\w+)\s+(?:to|=|into|as|→)\s+(\w+)/i,
    build: (m, ctx) => {
      const src = resolveSource(ctx.sourceNodes, m[1])
      const tgt = resolveTarget(ctx.targetNodes, m[2])
      if (!src || !tgt) return { intent: 'UNKNOWN', error: `Couldn't find: ${[!src && m[1], !tgt && m[2]].filter(Boolean).join(', ')}` }
      return {
        intent: 'DIRECT_MAP',
        sourceIds: [src],
        targetId: tgt,
        description: `Map ${m[1]} → ${m[2]}`,
      }
    },
  },

  // ── DIRECT MAP (plain A → B) ──
  {
    regex: /^(\w+)\s*(?:→|=>|->|=)\s*(\w+)$/i,
    build: (m, ctx) => {
      const src = resolveSource(ctx.sourceNodes, m[1])
      const tgt = resolveTarget(ctx.targetNodes, m[2])
      if (!src || !tgt) return { intent: 'UNKNOWN', error: `Couldn't find: ${[!src && m[1], !tgt && m[2]].filter(Boolean).join(', ')}` }
      return {
        intent: 'DIRECT_MAP',
        sourceIds: [src],
        targetId: tgt,
        description: `Map ${m[1]} → ${m[2]}`,
      }
    },
  },
]

/**
 * parseCommand — mocked LLM call.
 *
 * @param {string} inputText — the raw text from the Alchopilot command bar.
 * @param {Array}  sourceNodes — current ReactFlow nodes (used to find the source payload tree).
 * @param {Array}  targetNodes — same shape; we accept them as a separate arg so a future
 *                              dual-graph setup can pass different node sets. Today both
 *                              refer to the same canvas node list.
 * @returns {object} strict JSON payload (see contract at top of file).
 */
export function parseCommand(inputText, sourceNodes, targetNodes) {
  const text = String(inputText || '').trim()
  if (!text) {
    return { intent: 'UNKNOWN', error: 'Empty command' }
  }

  const ctx = { sourceNodes, targetNodes }
  for (const { regex, build } of PATTERNS) {
    const match = text.match(regex)
    if (match) return build(match, ctx)
  }

  return {
    intent: 'UNKNOWN',
    error: 'Could not parse command. Try: "uppercase name to fullName" or "merge firstName and lastName to fullName"',
  }
}

// Convenience export for tests / debugging
export const ALCHOPILOT_INTENTS = ['TRANSFORM_MAP', 'DIRECT_MAP', 'CONCAT_MAP', 'CONSTANT_MAP', 'UNKNOWN']
