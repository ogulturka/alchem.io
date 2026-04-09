/**
 * Alchem.io — Alchemize Mismatches Engine
 *
 * Analyzes schema validation errors and programmatically creates
 * ReactFlow nodes/edges to fix missing fields and format mismatches.
 */

// ── Helpers ──

function flattenObject(obj, prefix = '') {
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, path))
    } else {
      result[path] = value
    }
  }
  return result
}

function xmlToObject(xmlString) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'application/xml')
  if (doc.querySelector('parsererror')) return null
  function walk(node) {
    const children = Array.from(node.children)
    if (children.length === 0) {
      const t = node.textContent || ''
      if (t === 'true' || t === 'false') return t === 'true'
      if (/^-?\d+(\.\d+)?$/.test(t.trim()) && t.trim()) return Number(t)
      return t
    }
    const obj = {}
    for (const c of children) obj[c.tagName] = walk(c)
    return obj
  }
  return walk(doc.documentElement)
}

/** Search source tree for all leaf field handles */
function collectSourceHandles(tree, parentPath) {
  const handles = []
  for (const item of tree) {
    const field = item.field || item.label || ''
    const path = parentPath ? `${parentPath}.${field}` : field
    if (item.children && item.children.length > 0) {
      handles.push(...collectSourceHandles(item.children, path))
    } else {
      handles.push({ path, field: field.toLowerCase() })
    }
  }
  return handles
}

/** Fuzzy match: find best source field for a target field name */
function findBestSourceMatch(targetFieldName, sourceHandles) {
  const tLower = targetFieldName.toLowerCase()

  // 1. Exact match
  const exact = sourceHandles.find((h) => h.field === tLower)
  if (exact) return exact.path

  // 2. Contains match (e.g. "cityName" contains "city")
  const contains = sourceHandles.find((h) => tLower.includes(h.field) && h.field.length >= 3)
  if (contains) return contains.path

  // 3. Source contains target (e.g. source "zipCode" for target "postalCode")
  const reverseContains = sourceHandles.find((h) => h.field.includes(tLower) && tLower.length >= 3)
  if (reverseContains) return reverseContains.path

  // 4. Semantic synonyms
  const synonyms = {
    postalcode: ['zipcode', 'zip', 'postal'],
    zipcode: ['postalcode', 'postal', 'zip'],
    countryname: ['country', 'countrycode'],
    country: ['countryname', 'countrycode'],
    cityname: ['city'],
    city: ['cityname'],
    fullname: ['name', 'customername'],
    name: ['fullname', 'customername'],
    totalamount: ['amount', 'total', 'sum'],
    amount: ['totalamount', 'total'],
    isactive: ['status', 'active', 'enabled'],
    status: ['isactive', 'active'],
    processedat: ['timestamp', 'createdat', 'date', 'datetime'],
    timestamp: ['processedat', 'createdat', 'date'],
    formatteddate: ['date', 'orderdate', 'createdat'],
    fulladdress: ['street', 'address', 'addressline'],
    version: ['ver', 'apiversion'],
    currencycode: ['currency', 'curr'],
    currency: ['currencycode'],
  }

  const targetSyns = synonyms[tLower] || []
  for (const syn of targetSyns) {
    const match = sourceHandles.find((h) => h.field === syn)
    if (match) return match.path
  }

  return null
}

/** Detect if a value mismatch is a date format issue */
function isDateFormatMismatch(expectedValue, actualValue) {
  if (typeof expectedValue !== 'string' || typeof actualValue !== 'string') return false
  // Expected looks like "March 15, 2024" or "15.03.2024" etc
  // Actual looks like "2024-03-15" (ISO)
  const isoPattern = /^\d{4}-\d{2}-\d{2}/
  const longDatePattern = /[A-Za-z]+\s+\d{1,2},?\s+\d{4}/
  const dotDatePattern = /^\d{2}\.\d{2}\.\d{4}/
  const slashDatePattern = /^\d{2}\/\d{2}\/\d{4}/

  if (isoPattern.test(actualValue) && (longDatePattern.test(expectedValue) || dotDatePattern.test(expectedValue) || slashDatePattern.test(expectedValue))) {
    return true
  }
  return false
}

/** Detect what format a date string is in */
function detectDateFormat(dateStr) {
  if (/^[A-Za-z]+\s+\d{1,2},?\s+\d{4}/.test(dateStr)) return 'MM/dd/yyyy' // closest selectable
  if (/^\d{2}\.\d{2}\.\d{4}/.test(dateStr)) return 'dd.MM.yyyy'
  if (/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) return 'MM/dd/yyyy'
  if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) return "yyyy-MM-dd'T'HH:mm:ss'Z'"
  return 'yyyy-MM-dd'
}

/** Detect if two values are a concat (e.g. "123 Main St, New York" from "123 Main St" + "New York") */
function detectConcatSources(expectedValue, sourceFlat) {
  if (typeof expectedValue !== 'string') return null
  const sourceEntries = Object.entries(sourceFlat).filter(([, v]) => typeof v === 'string' && v.length > 2)
  // Check if expected value contains two source values
  for (let i = 0; i < sourceEntries.length; i++) {
    for (let j = i + 1; j < sourceEntries.length; j++) {
      const [pathA, valA] = sourceEntries[i]
      const [pathB, valB] = sourceEntries[j]
      if (expectedValue.includes(valA) && expectedValue.includes(valB)) {
        return { a: pathA, b: pathB }
      }
    }
  }
  return null
}

// ── Main Engine ──

let alchemizeIdCounter = 1

/**
 * Analyze mismatches and generate fix operations (new nodes + edges)
 *
 * @param {object} params
 * @param {string[]} params.errors - Validation error strings
 * @param {string} params.targetPayload - Target payload string (JSON/XML)
 * @param {string} params.targetFormat - 'json' or 'xml'
 * @param {string} params.resultString - Actual execution result
 * @param {object[]} params.sourceTree - Source payload tree from store
 * @param {object[]} params.nodes - Current ReactFlow nodes
 * @param {object[]} params.edges - Current ReactFlow edges
 * @returns {{ newNodes: object[], newEdges: object[], fixes: string[] }}
 */
export function alchemizeMismatches({ errors, targetPayload, targetFormat, resultString, sourceTree, nodes, edges }) {
  const newNodes = []
  const newEdges = []
  const fixes = []

  // Parse target and result into flat maps
  let targetObj, resultObj
  try {
    targetObj = targetFormat === 'json' ? JSON.parse(targetPayload) : xmlToObject(targetPayload)
    const trimmed = resultString?.trim() || ''
    if (trimmed.startsWith('{')) resultObj = JSON.parse(trimmed)
    else if (trimmed.startsWith('<')) resultObj = xmlToObject(trimmed)
  } catch { /* ignore parse errors */ }

  const targetFlat = targetObj ? flattenObject(targetObj) : {}
  const resultFlat = resultObj ? flattenObject(resultObj) : {}
  const sourceHandles = sourceTree ? collectSourceHandles(sourceTree, '') : []

  // Parse source payload into flat values for concat detection
  const sourceNode = nodes.find((n) => n.id === 'source-payload')
  const sourceFlat = {}
  if (sourceNode?.data?.tree) {
    const flatSource = {}
    function flattenTree(items, prefix) {
      for (const item of items) {
        const field = item.field || item.label || ''
        const path = prefix ? `${prefix}.${field}` : field
        if (item.children?.length) flattenTree(item.children, path)
        else flatSource[path] = item.value ?? ''
      }
    }
    flattenTree(sourceNode.data.tree, '')
    Object.assign(sourceFlat, flatSource)
  }

  // Existing edges: build set of already-mapped target handles
  const mappedTargets = new Set(
    edges.filter((e) => e.target === 'target-payload').map((e) => e.targetHandle)
  )

  // Position helper
  const targetNodeObj = nodes.find((n) => n.id === 'target-payload')
  const srcNodeObj = nodes.find((n) => n.id === 'source-payload')
  const midX = ((srcNodeObj?.position?.x || 0) + (targetNodeObj?.position?.x || 750)) / 2
  let nextY = Math.max(...nodes.filter((n) => n.type === 'transform').map((n) => n.position.y + 100), 50)

  for (const error of errors) {
    // ── Missing Field ──
    const missingMatch = error.match(/^Missing field:\s*(.+)$/)
    if (missingMatch) {
      const targetPath = missingMatch[1]
      if (mappedTargets.has(targetPath)) continue // already mapped

      const targetFieldName = targetPath.split('.').pop()
      const expectedValue = targetFlat[targetPath]

      // 1. Check if it's a concat (e.g. fullAddress = street + city)
      const concatSources = detectConcatSources(expectedValue, sourceFlat)
      if (concatSources) {
        const nodeId = `alch-concat-${alchemizeIdCounter++}`
        newNodes.push({
          id: nodeId, type: 'transform',
          position: { x: midX, y: nextY },
          data: { operation: 'concat' },
        })
        newEdges.push(
          { id: `alch-e-${alchemizeIdCounter++}`, source: 'source-payload', sourceHandle: concatSources.a, target: nodeId, targetHandle: 'in-a', type: 'smoothstep', animated: true },
          { id: `alch-e-${alchemizeIdCounter++}`, source: 'source-payload', sourceHandle: concatSources.b, target: nodeId, targetHandle: 'in-b', type: 'smoothstep', animated: true },
          { id: `alch-e-${alchemizeIdCounter++}`, source: nodeId, sourceHandle: 'out-result', target: 'target-payload', targetHandle: targetPath, type: 'smoothstep', animated: true },
        )
        fixes.push(`Concat ${concatSources.a.split('.').pop()} + ${concatSources.b.split('.').pop()} → ${targetFieldName}`)
        nextY += 100
        continue
      }

      // 2. Try fuzzy match to source field
      const sourceMatch = findBestSourceMatch(targetFieldName, sourceHandles)
      if (sourceMatch) {
        // Direct edge
        newEdges.push({
          id: `alch-e-${alchemizeIdCounter++}`,
          source: 'source-payload', sourceHandle: sourceMatch,
          target: 'target-payload', targetHandle: targetPath,
          type: 'smoothstep', animated: true,
        })
        fixes.push(`Map ${sourceMatch.split('.').pop()} → ${targetFieldName}`)
        continue
      }

      // 3. No source match → Constant node
      const constValue = expectedValue !== undefined ? String(expectedValue) : ''
      const nodeId = `alch-const-${alchemizeIdCounter++}`
      newNodes.push({
        id: nodeId, type: 'transform',
        position: { x: midX, y: nextY },
        data: { operation: 'constant', constantValue: constValue },
      })
      newEdges.push({
        id: `alch-e-${alchemizeIdCounter++}`,
        source: nodeId, sourceHandle: 'out-result',
        target: 'target-payload', targetHandle: targetPath,
        type: 'smoothstep', animated: true,
      })
      fixes.push(`Constant "${constValue}" → ${targetFieldName}`)
      nextY += 100
      continue
    }

    // ── Type/Format Mismatch (e.g. date) ──
    const typeMatch = error.match(/^Type mismatch on\s+(\w+)/)
    if (typeMatch) {
      const fieldName = typeMatch[1]
      // Find target path containing this field
      const targetPath = Object.keys(targetFlat).find((p) => p.endsWith(`.${fieldName}`) || p === fieldName)
      if (!targetPath) continue

      const expectedVal = targetFlat[targetPath]
      const actualVal = resultFlat[targetPath]

      if (isDateFormatMismatch(expectedVal, actualVal)) {
        // Find the existing edge going to this target
        const existingEdge = edges.find((e) => e.target === 'target-payload' && e.targetHandle === targetPath)
        if (!existingEdge) continue

        const fmt = detectDateFormat(String(expectedVal))
        const nodeId = `alch-datefmt-${alchemizeIdCounter++}`
        newNodes.push({
          id: nodeId, type: 'transform',
          position: { x: midX, y: nextY },
          data: { operation: 'formatDate', format: fmt },
        })

        // Rewire: remove direct edge, create source→dateFormat→target
        // We'll mark the old edge for removal
        newEdges.push(
          { id: `alch-e-${alchemizeIdCounter++}`, source: existingEdge.source, sourceHandle: existingEdge.sourceHandle, target: nodeId, targetHandle: 'in-input', type: 'smoothstep', animated: true },
          { id: `alch-e-${alchemizeIdCounter++}`, source: nodeId, sourceHandle: 'out-result', target: 'target-payload', targetHandle: targetPath, type: 'smoothstep', animated: true },
        )
        // Tag old edge for removal
        newEdges._removeEdgeIds = newEdges._removeEdgeIds || []
        newEdges._removeEdgeIds.push(existingEdge.id)

        fixes.push(`DateFormat (${fmt}) injected for ${fieldName}`)
        nextY += 100
        continue
      }
    }
  }

  return { newNodes, newEdges, fixes, removeEdgeIds: newEdges._removeEdgeIds || [] }
}
