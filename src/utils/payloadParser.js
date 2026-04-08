/**
 * Parses JSON or XML strings into a hierarchical tree structure
 * that PayloadTreeNode can render with connectable handles.
 */

function inferType(value) {
  if (value === null || value === undefined) return 'string'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') {
    if (value === 'true' || value === 'false') return 'boolean'
    if (/^-?\d+(\.\d+)?$/.test(value.trim())) return 'number'
  }
  return 'string'
}

// ── JSON Parser ──

function jsonToTree(obj) {
  if (typeof obj !== 'object' || obj === null) return []
  const entries = Array.isArray(obj) ? obj.map((v, i) => [`[${i}]`, v]) : Object.entries(obj)

  return entries.map(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { label: key, children: jsonToTree(value) }
    }
    if (Array.isArray(value)) {
      return { label: key, children: jsonToTree(value) }
    }
    return { field: key, type: inferType(value) }
  })
}

export function parseJSON(text) {
  try {
    const parsed = JSON.parse(text)
    return { tree: jsonToTree(parsed), error: null }
  } catch (e) {
    return { tree: [], error: e.message }
  }
}

// ── XML Parser (browser DOMParser) ──

function xmlNodeToTree(node) {
  const children = Array.from(node.childNodes).filter((n) => n.nodeType === 1)

  if (children.length === 0) {
    // Leaf element
    const textContent = node.textContent.trim()
    return { field: node.nodeName, type: inferType(textContent) }
  }

  // Branch element
  return {
    label: node.nodeName,
    children: children.map(xmlNodeToTree),
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
  return { tree: [], error: 'Unknown format' }
}
