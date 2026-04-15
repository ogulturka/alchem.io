/**
 * XSD / WSDL parser — extracts a schema tree from XML Schema or WSDL documents.
 *
 * Output format matches the payloadParser tree:
 *   { label, children, isArray? } for branch nodes
 *   { field, type } for leaf nodes
 *
 * And a schema tree suitable for SchemaBuilder (name, type, cardinality, children).
 */

const XS_TYPE_MAP = {
  'xs:string': 'string',
  'xs:normalizedString': 'string',
  'xs:token': 'string',
  'xs:int': 'number',
  'xs:integer': 'number',
  'xs:long': 'number',
  'xs:short': 'number',
  'xs:byte': 'number',
  'xs:decimal': 'number',
  'xs:float': 'number',
  'xs:double': 'number',
  'xs:boolean': 'boolean',
  'xs:date': 'date',
  'xs:dateTime': 'date',
  'xs:time': 'date',
}

function stripXsPrefix(type) {
  if (!type) return type
  // Handle xs: or xsd: prefixes
  return type.replace(/^(xs|xsd):/, 'xs:')
}

function mapXsType(xsType) {
  if (!xsType) return 'string'
  const normalized = stripXsPrefix(xsType)
  return XS_TYPE_MAP[normalized] || 'string'
}

/** Detect whether text is XSD, WSDL, or neither */
export function detectSchemaFormat(text) {
  if (!text || !text.trim().startsWith('<')) return null
  const lower = text.toLowerCase()
  if (/wsdl:definitions|<definitions[\s>]/i.test(text)) return 'wsdl'
  if (/<(xs|xsd):schema[\s>]/.test(text)) return 'xsd'
  return null
}

/**
 * Parse a single <xs:element> DOM node into a schema node.
 * Returns null if the element has no parseable name.
 */
function parseElement(elementNode, complexTypes) {
  const name = elementNode.getAttribute('name')
  if (!name) {
    // It might be a ref= reference
    const ref = elementNode.getAttribute('ref')
    if (!ref) return null
    // For simplicity, create a stub with the ref name
    return {
      name: ref.replace(/^[^:]+:/, ''),
      type: 'string',
      cardinality: '1',
      children: [],
    }
  }

  const typeAttr = elementNode.getAttribute('type')
  const minOccurs = elementNode.getAttribute('minOccurs') ?? '1'
  const maxOccurs = elementNode.getAttribute('maxOccurs') ?? '1'

  // Compute cardinality from min/maxOccurs
  let cardinality = '1'
  const minIsZero = minOccurs === '0'
  const maxIsMany = maxOccurs === 'unbounded' || Number(maxOccurs) > 1
  if (minIsZero && maxIsMany) cardinality = '0..n'
  else if (!minIsZero && maxIsMany) cardinality = '1..n'
  else if (minIsZero && !maxIsMany) cardinality = '0..1'

  // Try to find inline <xs:complexType> or reference a named one
  let complexType = null
  for (const child of Array.from(elementNode.children)) {
    const ln = localName(child)
    if (ln === 'complexType' || ln === 'simpleType') {
      complexType = child
      break
    }
  }

  // Resolve named complexType
  if (!complexType && typeAttr && !typeAttr.startsWith('xs:') && !typeAttr.startsWith('xsd:')) {
    const localType = typeAttr.replace(/^[^:]+:/, '')
    complexType = complexTypes.get(localType) || null
  }

  if (complexType && localName(complexType) === 'complexType') {
    // Container element — recurse into children
    const children = parseComplexTypeChildren(complexType, complexTypes)
    return {
      name,
      type: 'object',
      cardinality,
      children,
    }
  }

  // Primitive type
  return {
    name,
    type: mapXsType(typeAttr || 'xs:string'),
    cardinality,
    children: [],
  }
}

function localName(node) {
  return node.nodeName.replace(/^[^:]+:/, '')
}

/** Parse children inside a <xs:complexType> — look for sequence/choice/all/element refs */
function parseComplexTypeChildren(complexType, complexTypes) {
  const children = []

  function walk(node) {
    for (const child of Array.from(node.children)) {
      const ln = localName(child)
      if (ln === 'element') {
        const parsed = parseElement(child, complexTypes)
        if (parsed) children.push(parsed)
      } else if (ln === 'sequence' || ln === 'choice' || ln === 'all' || ln === 'complexContent' || ln === 'extension') {
        walk(child)
      }
    }
  }
  walk(complexType)
  return children
}

/** Build a map of named <xs:complexType> definitions for resolving type references */
function collectComplexTypes(schemaDoc) {
  const map = new Map()
  const all = schemaDoc.getElementsByTagName('*')
  for (const el of Array.from(all)) {
    if (localName(el) === 'complexType' && el.getAttribute('name')) {
      map.set(el.getAttribute('name'), el)
    }
  }
  return map
}

/**
 * Parse an XSD document and return an array of top-level schema nodes.
 */
export function parseXsd(xsdText) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xsdText, 'application/xml')
  if (doc.querySelector('parsererror')) {
    return { schema: [], error: 'Invalid XSD' }
  }

  // Find <xs:schema> — could be root or nested
  let schemaEl = doc.documentElement
  if (localName(schemaEl) !== 'schema') {
    const found = doc.getElementsByTagName('*')
    for (const el of Array.from(found)) {
      if (localName(el) === 'schema') { schemaEl = el; break }
    }
  }
  if (!schemaEl || localName(schemaEl) !== 'schema') {
    return { schema: [], error: 'No <xs:schema> element found' }
  }

  const complexTypes = collectComplexTypes(doc)

  // Top-level elements
  const result = []
  for (const child of Array.from(schemaEl.children)) {
    if (localName(child) === 'element') {
      const parsed = parseElement(child, complexTypes)
      if (parsed) result.push(parsed)
    }
  }

  return { schema: result, error: null }
}

/**
 * Parse a WSDL document — extract embedded <xs:schema> blocks and parse them.
 */
export function parseWsdl(wsdlText) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(wsdlText, 'application/xml')
  if (doc.querySelector('parsererror')) {
    return { schema: [], error: 'Invalid WSDL' }
  }

  // Find all <xs:schema> elements inside WSDL (typically under <types>)
  const all = doc.getElementsByTagName('*')
  const schemas = []
  for (const el of Array.from(all)) {
    if (localName(el) === 'schema') schemas.push(el)
  }

  if (schemas.length === 0) {
    return { schema: [], error: 'No XSD schema found inside WSDL' }
  }

  // Collect complex types from all schemas
  const complexTypes = collectComplexTypes(doc)

  // Parse top-level elements from all schemas
  const result = []
  for (const schemaEl of schemas) {
    for (const child of Array.from(schemaEl.children)) {
      if (localName(child) === 'element') {
        const parsed = parseElement(child, complexTypes)
        if (parsed) result.push(parsed)
      }
    }
  }

  return { schema: result, error: null }
}

/**
 * Convert schema nodes (name/type/cardinality/children) into payloadParser tree format
 * so the canvas PayloadTreeNode can render them.
 */
export function schemaNodesToPayloadTree(schemaNodes) {
  return schemaNodes.map(schemaNodeToPayloadTree).flat()
}

function schemaNodeToPayloadTree(schemaNode) {
  const isArray = schemaNode.cardinality === '0..n' || schemaNode.cardinality === '1..n'
  const hasChildren = schemaNode.children && schemaNode.children.length > 0

  if (hasChildren) {
    return {
      label: schemaNode.name,
      isArray,
      children: schemaNode.children.map(schemaNodeToPayloadTree),
    }
  }

  return {
    field: schemaNode.name,
    type: schemaNode.type === 'object' ? 'string' : schemaNode.type,
    ...(isArray ? { isArray: true } : {}),
  }
}

/**
 * Unified entry: parse XSD or WSDL text and return both the schema tree
 * (for SchemaBuilder) and the payload tree (for canvas).
 */
export function parseXsdOrWsdl(text, format) {
  const fn = format === 'wsdl' ? parseWsdl : parseXsd
  const { schema, error } = fn(text)
  if (error) return { schema: [], tree: [], error, rootTag: null }

  const tree = schemaNodesToPayloadTree(schema)

  // Infer a root tag from the first top-level element (useful for code generator)
  const rootTag = schema.length === 1 ? schema[0].name : null

  // If there's a single root schema with children, unwrap for the canvas
  // (matching parseXML behavior which also unwraps the single root)
  if (schema.length === 1 && schema[0].children && schema[0].children.length > 0) {
    return {
      schema,
      tree: schema[0].children.map(schemaNodeToPayloadTree),
      error: null,
      rootTag: schema[0].name,
    }
  }

  return { schema, tree, error: null, rootTag }
}
