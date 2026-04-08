/**
 * Bi-directional XML <-> JSON conversion utilities.
 * Uses browser-native DOMParser for XML parsing.
 */

// ── XML → JSON ──

function xmlElementToObj(el) {
  const children = Array.from(el.childNodes).filter((n) => n.nodeType === 1)

  if (children.length === 0) {
    // Leaf: return text content, attempt type coercion
    const text = el.textContent.trim()
    if (text === 'true') return true
    if (text === 'false') return false
    if (text !== '' && !isNaN(Number(text))) return Number(text)
    return text
  }

  // Check if all children share the same tag name (array-like)
  const tagNames = children.map((c) => c.nodeName)
  const allSame = tagNames.length > 1 && tagNames.every((t) => t === tagNames[0])

  if (allSame) {
    return children.map(xmlElementToObj)
  }

  const obj = {}
  for (const child of children) {
    const key = child.nodeName
    const value = xmlElementToObj(child)
    // Handle duplicate keys by converting to array
    if (obj[key] !== undefined) {
      if (!Array.isArray(obj[key])) obj[key] = [obj[key]]
      obj[key].push(value)
    } else {
      obj[key] = value
    }
  }
  return obj
}

export function xmlToJson(xmlString) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'application/xml')
  const errorNode = doc.querySelector('parsererror')
  if (errorNode) {
    throw new Error('Invalid XML: ' + errorNode.textContent.slice(0, 100))
  }
  const root = doc.documentElement
  const result = { [root.nodeName]: xmlElementToObj(root) }
  return JSON.stringify(result, null, 2)
}

// ── JSON → XML ──

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function isValidXmlTag(name) {
  return /^[a-zA-Z_][\w.-]*$/.test(name)
}

function objToXmlLines(obj, indent) {
  const lines = []

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      lines.push(`${indent}<item index="${i}">`)
      if (item && typeof item === 'object') {
        lines.push(...objToXmlLines(item, indent + '  '))
      } else {
        lines.push(`${indent}  ${escapeXml(item)}`)
      }
      lines.push(`${indent}</item>`)
    })
    return lines
  }

  if (typeof obj !== 'object' || obj === null) {
    lines.push(`${indent}${escapeXml(obj)}`)
    return lines
  }

  for (const [key, value] of Object.entries(obj)) {
    const tag = isValidXmlTag(key) ? key : `field_${key.replace(/[^a-zA-Z0-9_]/g, '_')}`

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${indent}<${tag}>`)
      lines.push(...objToXmlLines(value, indent + '  '))
      lines.push(`${indent}</${tag}>`)
    } else if (Array.isArray(value)) {
      // Wrap arrays: each element gets the key as tag name
      for (const item of value) {
        lines.push(`${indent}<${tag}>`)
        if (item && typeof item === 'object') {
          lines.push(...objToXmlLines(item, indent + '  '))
        } else {
          lines.push(`${indent}  ${escapeXml(item)}`)
        }
        lines.push(`${indent}</${tag}>`)
      }
    } else {
      lines.push(`${indent}<${tag}>${escapeXml(value)}</${tag}>`)
    }
  }
  return lines
}

export function jsonToXml(jsonString) {
  const parsed = JSON.parse(jsonString)

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('JSON root must be an object')
  }

  const topKeys = Object.keys(parsed)
  let rootTag, rootObj

  if (topKeys.length === 1) {
    // Single root key becomes the XML root element
    rootTag = isValidXmlTag(topKeys[0]) ? topKeys[0] : 'Root'
    rootObj = parsed[topKeys[0]]
  } else {
    // Multiple top-level keys: wrap in <Root>
    rootTag = 'Root'
    rootObj = parsed
  }

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${rootTag}>`,
    ...objToXmlLines(rootObj, '  '),
    `</${rootTag}>`,
  ]

  return lines.join('\n')
}

/**
 * Convert payload text between formats.
 * Returns { text, error } — error is null on success.
 */
export function convertPayload(text, fromFormat, toFormat) {
  if (fromFormat === toFormat) return { text, error: null }

  try {
    if (fromFormat === 'xml' && toFormat === 'json') {
      return { text: xmlToJson(text), error: null }
    }
    if (fromFormat === 'json' && toFormat === 'xml') {
      return { text: jsonToXml(text), error: null }
    }
    return { text, error: 'Unknown format combination' }
  } catch (e) {
    return { text: null, error: e.message }
  }
}
