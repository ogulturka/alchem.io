/**
 * Parses JSON or XML strings into a hierarchical schema tree
 * that PayloadTreeNode can render with connectable handles.
 *
 * Schema inference: arrays/repeated elements are deduplicated —
 * only the first item is used to infer the child schema, and
 * the parent node is flagged with isArray: true.
 */
import { parseXsdOrWsdl } from './xsdWsdlParser'

const DATE_REGEXPS = [
  /^\d{4}-\d{2}-\d{2}$/,                                // 2024-01-15
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, // ISO datetime
  /^\d{2}:\d{2}(:\d{2})?$/,                             // 14:30:00
  /^\d{2}\/\d{2}\/\d{4}$/,                              // 01/15/2024
  /^\d{2}\.\d{2}\.\d{4}$/,                              // 15.01.2024
]

function looksLikeDate(str) {
  const s = String(str).trim()
  return DATE_REGEXPS.some((re) => re.test(s))
}

function inferType(value) {
  if (value === null || value === undefined) return 'string'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') {
    const t = value.trim()
    if (t === 'true' || t === 'false') return 'boolean'
    if (looksLikeDate(t)) return 'date'
    if (/^-?\d+(\.\d+)?$/.test(t)) return 'number'
  }
  return 'string'
}

// ── JSON Schema Inferencer ──

function jsonToTree(obj) {
  if (typeof obj !== 'object' || obj === null) return []

  if (Array.isArray(obj)) {
    // Array: infer schema from first item only
    if (obj.length === 0) return []
    const first = obj[0]
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return jsonToTree(first)
    }
    return [{ field: 'item', type: inferType(first) }]
  }

  return Object.entries(obj).map(([key, value]) => {
    if (Array.isArray(value)) {
      // Array field: infer children from first element, flag as array
      if (value.length === 0) {
        return { label: key, isArray: true, children: [] }
      }
      const first = value[0]
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        return { label: key, isArray: true, children: jsonToTree(first) }
      }
      return { label: key, isArray: true, children: [{ field: 'item', type: inferType(first) }] }
    }
    if (value && typeof value === 'object') {
      return { label: key, children: jsonToTree(value) }
    }
    return { field: key, type: inferType(value) }
  })
}

export function parseJSON(text) {
  try {
    const parsed = JSON.parse(text)
    const tree = jsonToTree(parsed)
    // Infer root tag from single top-level key
    let rootTag = null
    if (!Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null) {
      const keys = Object.keys(parsed)
      if (keys.length === 1) rootTag = keys[0]
    }
    return { tree, error: null, rootTag }
  } catch (e) {
    return { tree: [], error: e.message }
  }
}

// ── XML Schema Inferencer (browser DOMParser) ──

function xmlNodeToTree(node) {
  const childElements = Array.from(node.childNodes).filter((n) => n.nodeType === 1)

  if (childElements.length === 0) {
    // Leaf element
    const textContent = node.textContent.trim()
    return { field: node.nodeName, type: inferType(textContent) }
  }

  // Deduplicate: group children by tag name
  const tagGroups = new Map()
  for (const child of childElements) {
    const tag = child.nodeName
    if (!tagGroups.has(tag)) {
      tagGroups.set(tag, { node: child, count: 1 })
    } else {
      tagGroups.get(tag).count++
    }
  }

  const children = []
  for (const [tag, { node: firstNode, count }] of tagGroups) {
    const childTree = xmlNodeToTree(firstNode)
    if (count > 1) {
      // Multiple siblings with same tag → array schema
      if (childTree.children) {
        children.push({ label: tag, isArray: true, children: childTree.children })
      } else {
        // Repeated leaf elements
        children.push({ label: tag, isArray: true, children: [{ field: 'item', type: childTree.type || 'string' }] })
      }
    } else {
      children.push(childTree)
    }
  }

  return {
    label: node.nodeName,
    children,
  }
}

export function parseXML(text) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(text, 'application/xml')
    const errorNode = doc.querySelector('parsererror')
    if (errorNode) {
      return { tree: [], error: 'Invalid XML' }
    }
    const root = doc.documentElement
    const tree = [xmlNodeToTree(root)]
    // Unwrap single root to show its children directly
    if (tree.length === 1 && tree[0].children) {
      return { tree: tree[0].children, error: null, rootTag: root.nodeName }
    }
    return { tree, error: null, rootTag: root.nodeName }
  } catch (e) {
    return { tree: [], error: e.message }
  }
}

export function parsePayload(text, format) {
  if (!text || !text.trim()) return { tree: [], error: 'Empty payload' }
  if (format === 'json') return parseJSON(text)
  if (format === 'xml') return parseXML(text)
  if (format === 'xsd' || format === 'wsdl') {
    const { tree, error, rootTag } = parseXsdOrWsdl(text, format)
    return { tree, error, rootTag }
  }
  return { tree: [], error: 'Unknown format' }
}
