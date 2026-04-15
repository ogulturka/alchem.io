/**
 * Generate a sample payload (JSON or XML) from a SchemaBuilderTree structure.
 *
 * Schema node shape:
 *   {
 *     id: string,
 *     name: string,
 *     type: 'string' | 'number' | 'boolean' | 'object' | 'array',
 *     cardinality: '1' | '0..1' | '1..n' | '0..n',
 *     children: [...] // for object: object's fields; for array: fields of each item object
 *   }
 */

import { parsePayload } from './payloadParser'
import { parseXsdOrWsdl } from './xsdWsdlParser'

const SAMPLES = {
  string: 'string',
  number: 0,
  boolean: false,
  date: '2024-01-01',
}

function isMultiple(card) {
  return card === '1..n' || card === '0..n'
}

let _idCounter = 0
function genId() {
  _idCounter++
  return `node-${Date.now().toString(36)}-${_idCounter}-${Math.random().toString(36).slice(2, 6)}`
}

export function createEmptyNode() {
  return {
    id: genId(),
    name: '',
    type: 'string',
    cardinality: '1',
    children: [],
  }
}

// ── JSON Generation ──

function nodeToJsonValue(node) {
  if (node.type === 'object') {
    const obj = {}
    for (const child of node.children || []) {
      if (!child.name) continue
      obj[child.name] = applyCardinality(nodeToJsonValue(child), child.cardinality)
    }
    return obj
  }

  if (node.type === 'array') {
    // Array's children = fields of one item object
    if (!node.children || node.children.length === 0) {
      return ['string']
    }
    const itemObj = {}
    for (const child of node.children) {
      if (!child.name) continue
      itemObj[child.name] = applyCardinality(nodeToJsonValue(child), child.cardinality)
    }
    return [itemObj]
  }

  return SAMPLES[node.type] ?? 'string'
}

function applyCardinality(value, card) {
  if (isMultiple(card)) return Array.isArray(value) ? value : [value]
  return value
}

function generateJsonPayload(schemaTree) {
  if (!schemaTree || schemaTree.length === 0) return '{}'

  const root = {}
  for (const node of schemaTree) {
    if (!node.name) continue
    root[node.name] = applyCardinality(nodeToJsonValue(node), node.cardinality)
  }
  return JSON.stringify(root, null, 2)
}

// ── XML Generation ──

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function nodeToXmlLines(node, indent) {
  const lines = []
  if (!node.name) return lines

  const tag = node.name
  // Repeat element if cardinality is multiple (sample 2 entries)
  const occurrences = isMultiple(node.cardinality) ? 2 : 1

  for (let i = 0; i < occurrences; i++) {
    if (node.type === 'object') {
      lines.push(`${indent}<${tag}>`)
      for (const child of node.children || []) {
        lines.push(...nodeToXmlLines(child, indent + '  '))
      }
      lines.push(`${indent}</${tag}>`)
    } else if (node.type === 'array') {
      // Generate two array items as a sample (each containing all child fields as the item schema)
      for (let j = 0; j < 2; j++) {
        if (!node.children || node.children.length === 0) {
          lines.push(`${indent}<${tag}>string</${tag}>`)
        } else {
          lines.push(`${indent}<${tag}>`)
          for (const child of node.children) {
            lines.push(...nodeToXmlLines(child, indent + '  '))
          }
          lines.push(`${indent}</${tag}>`)
        }
      }
    } else {
      const sample = SAMPLES[node.type] ?? 'string'
      lines.push(`${indent}<${tag}>${escapeXml(sample)}</${tag}>`)
    }
  }

  return lines
}

function generateXmlPayload(schemaTree) {
  if (!schemaTree || schemaTree.length === 0) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<Root/>'
  }

  const lines = ['<?xml version="1.0" encoding="UTF-8"?>']

  if (schemaTree.length === 1 && schemaTree[0].name) {
    lines.push(...nodeToXmlLines(schemaTree[0], ''))
  } else {
    lines.push('<Root>')
    for (const node of schemaTree) {
      lines.push(...nodeToXmlLines(node, '  '))
    }
    lines.push('</Root>')
  }

  return lines.join('\n')
}

export function generatePayloadFromSchema(schemaTree, format) {
  if (format === 'xml') return generateXmlPayload(schemaTree)
  return generateJsonPayload(schemaTree)
}

// ── Reverse: Payload → Schema ──

/**
 * Convert a parsed payload tree (from payloadParser) into a SchemaBuilder tree.
 */
function payloadTreeNodeToSchema(treeNode) {
  const name = treeNode.field || treeNode.label || ''
  const isArray = !!treeNode.isArray
  const hasChildren = treeNode.children && treeNode.children.length > 0

  if (hasChildren) {
    // Container — object (single) or repeated object (cardinality 0..n)
    return {
      id: genId(),
      name,
      type: 'object',
      cardinality: isArray ? '0..n' : '1',
      children: treeNode.children.map(payloadTreeNodeToSchema),
    }
  }

  // Leaf primitive
  const t = treeNode.type
  const schemaType = (t === 'object' || t === 'array') ? 'string' : (t || 'string')
  return {
    id: genId(),
    name,
    type: schemaType,
    cardinality: isArray ? '0..n' : '1',
    children: [],
  }
}

/**
 * Parse raw payload text (JSON/XML) and convert to a SchemaBuilder tree.
 * Wraps the payload tree in its rootTag if the parser unwrapped it (XML case).
 */
export function parsePayloadToSchema(text, format) {
  if (!text || !text.trim()) return { schema: [], error: null }

  // XSD/WSDL: use dedicated parser that already produces proper schema shape
  if (format === 'xsd' || format === 'wsdl') {
    const { schema, error } = parseXsdOrWsdl(text, format)
    if (error) return { schema: [], error }
    // Re-generate ids so edits in the builder don't collide
    const assignIds = (nodes) => nodes.map((n) => ({
      ...n,
      id: genId(),
      children: n.children ? assignIds(n.children) : [],
    }))
    return { schema: assignIds(schema), error: null }
  }

  const result = parsePayload(text, format)
  if (result.error) return { schema: [], error: result.error }
  if (!result.tree || result.tree.length === 0) return { schema: [], error: null }

  // If parser unwrapped a root tag (XML), re-wrap it as a single root schema node
  if (result.rootTag) {
    return {
      schema: [{
        id: genId(),
        name: result.rootTag,
        type: 'object',
        cardinality: '1',
        children: result.tree.map(payloadTreeNodeToSchema),
      }],
      error: null,
    }
  }

  return {
    schema: result.tree.map(payloadTreeNodeToSchema),
    error: null,
  }
}
