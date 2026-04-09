/**
 * Alchem.io — Schema Validator
 *
 * Compares a transformation result against the known Target Payload
 * structure and data types. Reports missing fields, extra fields,
 * and type mismatches.
 */

// ── Build a flat schema from the target payload ──

function inferType(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean' || value === 'true' || value === 'false') return 'boolean'
  if (typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim()))) return 'number'
  if (typeof value === 'object' && !Array.isArray(value)) return 'object'
  if (Array.isArray(value)) return 'array'
  return 'string'
}

/**
 * Flatten an object into a map of dot-paths → expected types.
 * E.g. { customer: { name: "John", age: 30 } }
 * → { "customer": "object", "customer.name": "string", "customer.age": "number" }
 */
function buildSchemaMap(obj, prefix = '') {
  const schema = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    const type = inferType(value)
    schema[path] = type
    if (type === 'object' && value !== null) {
      Object.assign(schema, buildSchemaMap(value, path))
    }
  }
  return schema
}

// ── XML to JS Object (for validation) ──

function xmlToObject(xmlString) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'application/xml')
  const error = doc.querySelector('parsererror')
  if (error) return null

  function nodeToObj(node) {
    const children = Array.from(node.children)
    if (children.length === 0) {
      const text = node.textContent || ''
      // Try to infer type from text
      if (text === 'true' || text === 'false') return text === 'true'
      if (/^-?\d+(\.\d+)?$/.test(text.trim()) && text.trim() !== '') return Number(text)
      return text
    }
    const obj = {}
    for (const child of children) {
      obj[child.tagName] = nodeToObj(child)
    }
    return obj
  }

  return nodeToObj(doc.documentElement)
}

// ── Build type overrides from ReactFlow tree ──

/** Extract a flat map of dot-paths → user-defined types from a payload tree */
export function buildTypeMapFromTree(tree, prefix = '') {
  const map = {}
  for (const item of tree) {
    const name = item.field || item.label || ''
    const path = prefix ? `${prefix}.${name}` : name
    if (item.children && item.children.length > 0) {
      Object.assign(map, buildTypeMapFromTree(item.children, path))
    } else if (item.type) {
      map[path] = item.type
    }
  }
  return map
}

// ── Main Validation ──

/**
 * @param {string} resultString - The execution result (JSON or XML string)
 * @param {string} targetPayloadString - The target payload definition (JSON or XML)
 * @param {string} targetFormat - 'json' or 'xml'
 * @param {object} [typeOverrides] - Optional map of dot-path → user-defined type from the target tree
 * @returns {{ status: 'success'|'warning'|'error', matchPercent: number, errors: string[] }}
 */
export function validateAgainstTargetSchema(resultString, targetPayloadString, targetFormat, typeOverrides) {
  try {
    // Parse target schema
    let targetObj
    if (targetFormat === 'json') {
      targetObj = JSON.parse(targetPayloadString)
    } else {
      targetObj = xmlToObject(targetPayloadString)
    }
    if (!targetObj) return { status: 'error', matchPercent: 0, errors: ['Could not parse target schema.'] }

    // Parse result
    let resultObj
    const trimmed = resultString.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      resultObj = JSON.parse(trimmed)
    } else if (trimmed.startsWith('<')) {
      resultObj = xmlToObject(trimmed)
    } else {
      return { status: 'error', matchPercent: 0, errors: ['Result is not valid JSON or XML.'] }
    }
    if (!resultObj) return { status: 'error', matchPercent: 0, errors: ['Could not parse execution result.'] }

    // Build schema maps (leaf fields only — skip "object" type entries)
    const targetSchema = buildSchemaMap(targetObj)
    const resultSchema = buildSchemaMap(resultObj)

    // Apply user type overrides from the interactive tree
    if (typeOverrides) {
      for (const [path, userType] of Object.entries(typeOverrides)) {
        if (path in targetSchema) {
          targetSchema[path] = userType
        }
      }
    }

    const targetLeaves = Object.entries(targetSchema).filter(([, t]) => t !== 'object')
    const errors = []
    let matched = 0

    for (const [path, expectedType] of targetLeaves) {
      if (!(path in resultSchema)) {
        errors.push(`Missing field: ${path}`)
        continue
      }

      const actualType = resultSchema[path]
      if (actualType === 'object' && expectedType !== 'object') {
        errors.push(`Type mismatch on ${path}: expected ${expectedType}, got object`)
        continue
      }

      // "date" type: treat as string (dates are always strings in output)
      const normalizedExpected = expectedType === 'date' ? 'string' : expectedType
      const normalizedActual = actualType === 'date' ? 'string' : actualType

      // Relaxed type checking: string↔number is common in XML results
      if (normalizedExpected !== normalizedActual && normalizedActual !== 'object') {
        if ((normalizedExpected === 'number' && normalizedActual === 'string') ||
            (normalizedExpected === 'string' && normalizedActual === 'number')) {
          matched++ // soft match
          continue
        }
        errors.push(`Type mismatch on ${path.split('.').pop()}: expected ${expectedType}, got ${actualType}`)
        continue
      }

      matched++
    }

    // Check for extra fields not in target
    const resultLeaves = Object.entries(resultSchema).filter(([, t]) => t !== 'object')
    for (const [path] of resultLeaves) {
      if (!(path in targetSchema)) {
        const isChild = Object.keys(targetSchema).some((tp) => path.startsWith(tp + '.'))
        if (!isChild) {
          errors.push(`Extra field: ${path}`)
        }
      }
    }

    const total = targetLeaves.length
    const matchPercent = total > 0 ? Math.round((matched / total) * 100) : 0

    if (errors.length === 0) {
      return { status: 'success', matchPercent: 100, errors: [] }
    }

    const missingCount = errors.filter((e) => e.startsWith('Missing')).length
    const severity = missingCount > total / 2 ? 'error' : 'warning'
    return { status: severity, matchPercent, errors }
  } catch (err) {
    return { status: 'error', matchPercent: 0, errors: [`Validation error: ${err.message}`] }
  }
}
