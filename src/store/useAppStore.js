import { create } from 'zustand'
import { applyNodeChanges, applyEdgeChanges, addEdge, MarkerType } from '@xyflow/react'
import { parsePayload } from '../utils/payloadParser'
import { generateXSLT, generateGroovy } from '../utils/codeGenerator'
import { convertPayload } from '../utils/formatConverter'

const ARROW_MARKER = {
  type: MarkerType.ArrowClosed,
  width: 16,
  height: 16,
  color: 'var(--color-edge)',
}

const MONACO_THEME_MAP = {
  carbon: 'vs-dark',
  stark: 'light',
  oceanic: 'vs-dark',
}

const DEFAULT_SOURCE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<PayloadRequest>
  <Header>
    <MessageId>MSG-20240315-001</MessageId>
    <Timestamp>2024-03-15T10:30:00Z</Timestamp>
    <Source>CRM-System</Source>
  </Header>
  <Body>
    <Customer>
      <name>John Doe</name>
      <amount>1500.00</amount>
      <currency>USD</currency>
      <date>2024-03-15</date>
      <status>active</status>
      <Address>
        <street>123 Main St</street>
        <city>New York</city>
        <zipCode>10001</zipCode>
        <country>US</country>
      </Address>
    </Customer>
  </Body>
</PayloadRequest>`

const DEFAULT_TARGET_JSON = `{
  "TransformedPayload": {
    "metadata": {
      "processedAt": "2024-03-15T10:30:01Z",
      "version": "2.0"
    },
    "customer": {
      "fullName": "JOHN DOE",
      "totalAmount": 1500.00,
      "formattedDate": "March 15, 2024",
      "currencyCode": "USD",
      "isActive": true,
      "address": {
        "fullAddress": "123 Main St, New York",
        "cityName": "New York",
        "postalCode": "10001",
        "countryName": "US"
      }
    }
  }
}`

// Parse initial trees
const initSourceResult = parsePayload(DEFAULT_SOURCE_XML, 'xml')
const initTargetResult = parsePayload(DEFAULT_TARGET_JSON, 'json')

const initialNodes = [
  {
    id: 'source-payload',
    type: 'payloadTree',
    position: { x: 0, y: 0 },
    draggable: true,
    data: {
      label: 'Source Payload',
      tree: initSourceResult.tree,
      handleType: 'source',
      handlePosition: 'right',
      icon: 'database',
    },
  },
  {
    id: 'target-payload',
    type: 'payloadTree',
    position: { x: 750, y: 0 },
    draggable: true,
    data: {
      label: 'Target Payload',
      tree: initTargetResult.tree,
      handleType: 'target',
      handlePosition: 'left',
      icon: 'folder',
    },
  },
  {
    id: 'transform-uppercase-1',
    type: 'transform',
    position: { x: 380, y: 30 },
    data: { operation: 'uppercase' },
  },
  {
    id: 'transform-formatdate-1',
    type: 'transform',
    position: { x: 380, y: 200 },
    data: { operation: 'formatDate' },
  },
]

const initialEdges = [
  {
    id: 'e-name-upper',
    source: 'source-payload',
    sourceHandle: 'Body.Customer.name',
    target: 'transform-uppercase-1',
    targetHandle: 'in-input',
    type: 'smoothstep',
    animated: true,
  },
  {
    id: 'e-upper-fullname',
    source: 'transform-uppercase-1',
    sourceHandle: 'out-result',
    target: 'target-payload',
    targetHandle: 'TransformedPayload.customer.fullName',
    type: 'smoothstep',
    animated: true,
  },
  {
    id: 'e-date-format',
    source: 'source-payload',
    sourceHandle: 'Body.Customer.date',
    target: 'transform-formatdate-1',
    targetHandle: 'in-input',
    type: 'smoothstep',
    animated: true,
  },
  {
    id: 'e-format-fdate',
    source: 'transform-formatdate-1',
    sourceHandle: 'out-result',
    target: 'target-payload',
    targetHandle: 'TransformedPayload.customer.formattedDate',
    type: 'smoothstep',
    animated: true,
  },
  {
    id: 'e-amount-total',
    source: 'source-payload',
    sourceHandle: 'Body.Customer.amount',
    target: 'target-payload',
    targetHandle: 'TransformedPayload.customer.totalAmount',
    type: 'smoothstep',
    animated: true,
  },
  {
    id: 'e-currency-code',
    source: 'source-payload',
    sourceHandle: 'Body.Customer.currency',
    target: 'target-payload',
    targetHandle: 'TransformedPayload.customer.currencyCode',
    type: 'smoothstep',
    animated: true,
  },
]

let transformIdCounter = 2

/** Collect all leaf field handle IDs from a schema tree */
function collectHandleIds(tree, parentPath) {
  const ids = new Set()
  for (const item of tree) {
    const name = item.field || item.label || ''
    const path = parentPath ? `${parentPath}.${name}` : name
    if (item.children && item.children.length > 0) {
      for (const id of collectHandleIds(item.children, path)) {
        ids.add(id)
      }
    } else {
      ids.add(path)
    }
  }
  return ids
}

const useAppStore = create((set, get) => ({
  // ── Theme ──
  theme: 'carbon',
  setTheme: (theme) => set({ theme }),
  getMonacoTheme: () => MONACO_THEME_MAP[get().theme],

  // ── Payload Formats ──
  sourceFormat: 'xml',
  targetFormat: 'json',
  conversionError: { source: null, target: null },

  setSourceFormat: (newFormat) => {
    const { sourceFormat: oldFormat } = get()
    if (oldFormat === newFormat) return

    // XSD/WSDL are schema definition formats — no content conversion, just switch
    const isSchemaFormat = (f) => f === 'xsd' || f === 'wsdl'
    if (isSchemaFormat(newFormat) || isSchemaFormat(oldFormat)) {
      set({ sourceFormat: newFormat, conversionError: { ...get().conversionError, source: null } })
      setTimeout(() => get().syncSourceTree(), 0)
      return
    }

    const { requestCode } = get()
    const result = convertPayload(requestCode, oldFormat, newFormat)
    if (result.error) {
      console.warn('[Alchem.io] Source conversion failed:', result.error)
      set({ conversionError: { ...get().conversionError, source: result.error } })
    } else {
      set({ sourceFormat: newFormat, requestCode: result.text, conversionError: { ...get().conversionError, source: null } })
      setTimeout(() => get().syncSourceTree(), 0)
    }
  },

  setTargetFormat: (newFormat) => {
    const { targetFormat: oldFormat } = get()
    if (oldFormat === newFormat) return

    const isSchemaFormat = (f) => f === 'xsd' || f === 'wsdl'
    if (isSchemaFormat(newFormat) || isSchemaFormat(oldFormat)) {
      set({ targetFormat: newFormat, conversionError: { ...get().conversionError, target: null } })
      setTimeout(() => get().syncTargetTree(), 0)
      return
    }

    const { responseStructure } = get()
    const result = convertPayload(responseStructure, oldFormat, newFormat)
    if (result.error) {
      console.warn('[Alchem.io] Target conversion failed:', result.error)
      set({ conversionError: { ...get().conversionError, target: result.error } })
    } else {
      set({ targetFormat: newFormat, responseStructure: result.text, conversionError: { ...get().conversionError, target: null } })
      setTimeout(() => get().syncTargetTree(), 0)
    }
  },

  // ── Editors ──
  requestCode: DEFAULT_SOURCE_XML,
  responseStructure: DEFAULT_TARGET_JSON,
  setRequestCode: (requestCode) => set({ requestCode }),
  setResponseStructure: (responseStructure) => set({ responseStructure }),

  // ── Parse & Sync Trees ──
  parseError: { source: null, target: null },

  syncSourceTree: () => {
    const { requestCode, sourceFormat, nodes, edges } = get()
    const result = parsePayload(requestCode, sourceFormat)
    const updated = nodes.map((n) =>
      n.id === 'source-payload'
        ? { ...n, data: { ...n.data, tree: result.tree, rootTag: result.rootTag || null } }
        : n
    )
    // Purge stale edges referencing handles that no longer exist
    const validHandles = collectHandleIds(result.tree, '')
    const cleanEdges = edges.filter((e) => {
      if (e.source === 'source-payload' && !validHandles.has(e.sourceHandle)) return false
      return true
    })
    set({
      nodes: updated,
      edges: cleanEdges,
      parseError: { ...get().parseError, source: result.error },
    })
  },

  syncTargetTree: () => {
    const { responseStructure, targetFormat, nodes, edges } = get()
    const result = parsePayload(responseStructure, targetFormat)
    const updated = nodes.map((n) =>
      n.id === 'target-payload'
        ? { ...n, data: { ...n.data, tree: result.tree, rootTag: result.rootTag || null } }
        : n
    )
    // Purge stale edges referencing handles that no longer exist
    const validHandles = collectHandleIds(result.tree, '')
    const cleanEdges = edges.filter((e) => {
      if (e.target === 'target-payload' && !validHandles.has(e.targetHandle)) return false
      return true
    })
    set({
      nodes: updated,
      edges: cleanEdges,
      parseError: { ...get().parseError, target: result.error },
    })
  },

  // ── Flow ──
  nodes: initialNodes,
  edges: initialEdges,
  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (connection) =>
    set({ edges: addEdge({ ...connection, type: 'smoothstep', animated: true, markerEnd: ARROW_MARKER }, get().edges) }),
  addTransformNode: (operation, position) => {
    const id = `transform-${operation}-${transformIdCounter++}`
    const defaults = {
      substring: { substringStart: 0, substringLength: 5 },
      formatDate: { format: 'yyyy-MM-dd' },
      math: { mathOperator: '+' },
    }
    const data = { operation, ...(defaults[operation] || {}) }
    set({ nodes: [...get().nodes, { id, type: 'transform', position, data }] })
  },
  clearMappings: () => {
    const { nodes } = get()
    set({
      nodes: nodes.filter((n) => n.id === 'source-payload' || n.id === 'target-payload'),
      edges: [],
      generatedCode: { xslt: '', groovy: '' },
      highlightedEdgeIds: null,
      highlightedNodeIds: null,
      lockedEdgeIds: null,
      lockedNodeIds: null,
    })
  },
  updateNodeData: (nodeId, dataUpdate) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...dataUpdate } } : n
      ),
    })
  },

  updateFieldType: (nodeId, fieldPath, newType) => {
    function updateTree(items, pathParts) {
      return items.map((item) => {
        const name = item.field || item.label || ''
        if (pathParts.length === 1 && name === pathParts[0] && item.field) {
          return { ...item, type: newType }
        }
        if (name === pathParts[0] && item.children) {
          return { ...item, children: updateTree(item.children, pathParts.slice(1)) }
        }
        return item
      })
    }
    const parts = fieldPath.split('.')
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== nodeId) return n
        return { ...n, data: { ...n.data, tree: updateTree(n.data.tree, parts) } }
      }),
    })
  },

  // ── Edge & Node Highlight ──
  highlightedEdgeIds: null, // null = all visible, Set<string> = only these highlighted
  highlightedNodeIds: null, // Set<string> of node IDs to highlight
  lockedEdgeIds: null,      // Locked (clicked) edge highlight — persists until pane click
  lockedNodeIds: null,

  setHighlightedEdges: (edgeIds) => set({ highlightedEdgeIds: edgeIds }),
  setHighlightedNodes: (nodeIds) => set({ highlightedNodeIds: nodeIds }),
  clearHighlightedEdges: () => set({ highlightedEdgeIds: null, highlightedNodeIds: null }),
  lockEdges: (edgeIds, nodeIds) => set({ lockedEdgeIds: edgeIds, lockedNodeIds: nodeIds, highlightedEdgeIds: edgeIds, highlightedNodeIds: nodeIds }),
  unlockEdges: () => set({ lockedEdgeIds: null, lockedNodeIds: null, highlightedEdgeIds: null, highlightedNodeIds: null }),

  getEdgesForNode: (nodeId) => {
    const { edges } = get()
    return edges.filter((e) => e.source === nodeId || e.target === nodeId).map((e) => e.id)
  },

  // ── UDF Library ──
  udfs: [], // [{ id, name, args: ['arg1','arg2'], code: '...' }]
  addUdf: (udf) => set({ udfs: [...get().udfs, { ...udf, id: `udf-${Date.now()}` }] }),
  updateUdf: (id, updates) => set({ udfs: get().udfs.map((u) => u.id === id ? { ...u, ...updates } : u) }),
  removeUdf: (id) => set({ udfs: get().udfs.filter((u) => u.id !== id) }),

  // ── Code Generation ──
  isGenerating: false,
  generatedCode: { xslt: '', groovy: '' },
  activeOutputTab: 'xslt',
  setActiveOutputTab: (activeOutputTab) => set({ activeOutputTab }),

  // ── SOAP Envelope Toggles ──
  isSourceSoap: false,
  isTargetSoap: false,
  setSourceSoap: (val) => set({ isSourceSoap: val }),
  setTargetSoap: (val) => set({ isTargetSoap: val }),

  // ── Groovy Platform ──
  groovyPlatform: 'sap-cpi', // 'sap-cpi' | 'sap-po' | 'apache-camel'
  setGroovyPlatform: (groovyPlatform) => set({ groovyPlatform }),

  alchemize: () => {
    set({ isGenerating: true })
    setTimeout(() => {
      try {
        const { nodes, edges, sourceFormat, targetFormat, groovyPlatform, isSourceSoap, isTargetSoap, requestCode } = get()
        const soapFlags = { isSourceSoap, isTargetSoap }
        const xslt = generateXSLT(nodes, edges, sourceFormat, targetFormat, soapFlags, requestCode)
        const groovy = generateGroovy(nodes, edges, sourceFormat, targetFormat, groovyPlatform, soapFlags)
        set({
          isGenerating: false,
          generatedCode: { xslt, groovy },
        })
      } catch (err) {
        console.error('[Alchem.io] Code generation failed:', err)
        set({
          isGenerating: false,
          generatedCode: {
            xslt: `<!-- Code generation error:\n${err?.message || err}\n-->`,
            groovy: `// Code generation error:\n// ${err?.message || err}`,
          },
        })
      }
    }, 800)
  },
}))

export default useAppStore
