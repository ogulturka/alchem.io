/**
 * Alchem.io — Groovy Mock Engine
 *
 * Translates the generated Groovy mapping scripts into JavaScript
 * for in-browser testing. Handles the specific patterns our code
 * generator produces (not a general-purpose Groovy interpreter).
 *
 * Supported patterns:
 *  - src.path.to.field / src.path.to.field.text()  → property access
 *  - .toString().toUpperCase()                      → string upper
 *  - .toString().replace("a", "b")                  → string replace
 *  - .substring(start, Math.min(start+len, ...))    → substring
 *  - Date.parse("fmt", val).format("fmt")           → date formatting
 *  - "${expr} ${expr}"  (GString interpolation)     → template concat
 *  - (val as BigDecimal) +/-  /* (val as BigDecimal) → arithmetic
 *  - cond ? trueVal : falseVal                      → ternary
 *  - val == val2                                    → equality
 *  - "literal"                                      → string constant
 *  - JsonBuilder / MarkupBuilder output blocks      → object construction
 */

// ── XML to JS Object converter ──

function xmlToJsObject(xmlString) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'application/xml')
  const error = doc.querySelector('parsererror')
  if (error) throw new Error(`XML Parse Error: ${error.textContent}`)

  // Strip namespace prefix so downstream access is namespace-agnostic
  // (mirrors the generator's use of local-name() / _findByLocal)
  const stripPrefix = (name) => name.replace(/^[^:]+:/, '')

  function nodeToObj(node) {
    const children = Array.from(node.children)
    if (children.length === 0) {
      return node.textContent || ''
    }
    const obj = {}
    for (const child of children) {
      const key = stripPrefix(child.tagName)
      const value = nodeToObj(child)
      if (key in obj) {
        if (!Array.isArray(obj[key])) obj[key] = [obj[key]]
        obj[key].push(value)
      } else {
        obj[key] = value
      }
    }
    return obj
  }

  return nodeToObj(doc.documentElement)
}

// ── Resolve a dot-path on a JS object ──

function resolvePath(obj, path) {
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current == null) return undefined
    current = current[part]
  }
  return current
}

// ── Date formatting (Java SimpleDateFormat → JS) ──

function formatDate(dateStr, pattern) {
  // Parse yyyy-MM-dd or yyyy-MM-ddTHH:mm:ssZ
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr // can't parse, return as-is

  const pad = (n) => String(n).padStart(2, '0')
  const year = d.getFullYear()
  const month = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hours = pad(d.getHours())
  const minutes = pad(d.getMinutes())
  const seconds = pad(d.getSeconds())

  switch (pattern) {
    case 'MM/dd/yyyy':
      return `${month}/${day}/${year}`
    case 'yyyy-MM-dd':
      return `${year}-${month}-${day}`
    case 'dd.MM.yyyy':
      return `${day}.${month}.${year}`
    case "yyyy-MM-dd'T'HH:mm:ss'Z'":
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`
    default:
      return `${year}-${month}-${day}`
  }
}

// ── Expression evaluator ──
// Converts a single Groovy def-expression into a JS value

function evaluateExpression(expr, src, variables) {
  const trimmed = expr.trim()

  // 1) String literal: "something"
  const literalMatch = trimmed.match(/^"((?:[^"\\]|\\.)*)"$/)
  if (literalMatch) {
    // Check for GString interpolation: ${...}
    const raw = literalMatch[1]
    if (raw.includes('${')) {
      return raw.replace(/\$\{([^}]+)\}/g, (_, inner) => {
        return String(resolveAccessor(inner.trim(), src, variables) ?? '')
      })
    }
    return raw.replace(/\\"/g, '"')
  }

  // 2) Date.parse("inputFmt", accessor).format("outputFmt")
  const dateMatch = trimmed.match(/^Date\.parse\("([^"]*)",\s*(.+?)\.toString\(\)\)\.format\("([^"]*)"\)$/)
  if (dateMatch) {
    const accessor = dateMatch[2]
    const outputFmt = dateMatch[3]
    const val = resolveAccessor(accessor, src, variables)
    return formatDate(String(val ?? ''), outputFmt)
  }

  // 3) Ternary: cond ? trueExpr : falseExpr
  const ternaryMatch = trimmed.match(/^(.+?)\s+\?\s+(.+?)\s+:\s+(.+)$/)
  if (ternaryMatch) {
    const cond = resolveAccessor(ternaryMatch[1].trim(), src, variables)
    const truthyVal = resolveAccessor(ternaryMatch[2].trim(), src, variables)
    const falsyVal = resolveAccessor(ternaryMatch[3].trim(), src, variables)
    return cond ? truthyVal : falsyVal
  }

  // 4) Equality: exprA == exprB
  const eqMatch = trimmed.match(/^(.+?)\s+==\s+(.+)$/)
  if (eqMatch) {
    const a = resolveAccessor(eqMatch[1].trim(), src, variables)
    const b = resolveAccessor(eqMatch[2].trim(), src, variables)
    return String(a) === String(b)
  }

  // 5) Math: (exprA as BigDecimal) op (exprB as BigDecimal)
  const mathMatch = trimmed.match(/^\((.+?)\s+as\s+BigDecimal\)\s*([+\-*/])\s*\((.+?)\s+as\s+BigDecimal\)$/)
  if (mathMatch) {
    const a = Number(resolveAccessor(mathMatch[1].trim(), src, variables)) || 0
    const b = Number(resolveAccessor(mathMatch[3].trim(), src, variables)) || 0
    const op = mathMatch[2]
    switch (op) {
      case '+': return a + b
      case '-': return a - b
      case '*': return a * b
      case '/': return b !== 0 ? a / b : 0
    }
  }

  // 6) Substring: expr.substring(start, Math.min(start + len, expr.length()))
  const subMatch = trimmed.match(/^(.+?)\.substring\((\d+),\s*Math\.min\((\d+)\s*\+\s*(\d+),\s*.+?\.length\(\)\)\)$/)
  if (subMatch) {
    const val = String(resolveAccessor(subMatch[1].trim(), src, variables) ?? '')
    const start = Number(subMatch[2])
    const len = Number(subMatch[4])
    return val.substring(start, Math.min(start + len, val.length))
  }

  // 7) Replace: expr.toString().replace("search", "replacement")
  const replaceMatch = trimmed.match(/^(.+?)\.toString\(\)\.replace\("((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\)$/)
  if (replaceMatch) {
    const val = String(resolveAccessor(replaceMatch[1].trim(), src, variables) ?? '')
    const search = replaceMatch[2].replace(/\\"/g, '"')
    const replacement = replaceMatch[3].replace(/\\"/g, '"')
    return val.split(search).join(replacement)
  }

  // 8) toUpperCase: expr.toString().toUpperCase()
  const upperMatch = trimmed.match(/^(.+?)\.toString\(\)\.toUpperCase\(\)$/)
  if (upperMatch) {
    const val = resolveAccessor(upperMatch[1].trim(), src, variables)
    return String(val ?? '').toUpperCase()
  }

  // 9) Direct accessor (src.path.to.field or src.path.to.field.text())
  return resolveAccessor(trimmed, src, variables)
}

function resolveAccessor(expr, src, variables) {
  let trimmed = expr.trim()

  // Unwrap outer parentheses — e.g. "(expr ?: '')" or "(expr)"
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    // Make sure the parens are truly outer, not part of a function call
    let depth = 0, balanced = true
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === '(') depth++
      else if (trimmed[i] === ')') { depth--; if (depth === 0 && i < trimmed.length - 1) { balanced = false; break } }
    }
    if (balanced) trimmed = trimmed.slice(1, -1).trim()
  }

  // Strip trailing `?: ''` (Elvis operator with empty fallback)
  trimmed = trimmed.replace(/\s*\?\:\s*['"][^'"]*['"]\s*$/, '').trim()

  // String literal
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const raw = trimmed.slice(1, -1)
    if (raw.includes('${')) {
      return raw.replace(/\$\{([^}]+)\}/g, (_, inner) => {
        return String(resolveAccessor(inner.trim(), src, variables) ?? '')
      })
    }
    return raw.replace(/\\"/g, '"')
  }

  // Numeric literal
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }

  // Boolean
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false

  // Variable reference
  if (variables.has(trimmed)) return variables.get(trimmed)

  // _findByLocal(root, ['A', 'B', 'C'])?.text()
  const findByLocalMatch = trimmed.match(/^_findByLocal\(\s*(\w+)\s*,\s*\[([^\]]+)\]\s*\)(\?\.text\(\))?(\?\.toString\(\))?$/)
  if (findByLocalMatch) {
    const rootVar = findByLocalMatch[1]
    const segs = findByLocalMatch[2]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    const rootObj = rootVar === 'src' ? src : variables.get(rootVar)
    if (!rootObj) return ''
    const resolved = resolvePath(rootObj, segs.join('.'))
    return resolved ?? ''
  }

  // Strip .text() suffix (XML accessor)
  let path = trimmed.replace(/\?\.text\(\)$/, '').replace(/\.text\(\)$/, '')

  // Strip .toString() suffix
  path = path.replace(/\?\.toString\(\)$/, '').replace(/\.toString\(\)$/, '')

  // Try _findByLocal after stripping suffixes (e.g. inside toUpperCase chain)
  const fblAfterStrip = path.match(/^_findByLocal\(\s*(\w+)\s*,\s*\[([^\]]+)\]\s*\)$/)
  if (fblAfterStrip) {
    const rootVar = fblAfterStrip[1]
    const segs = fblAfterStrip[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    const rootObj = rootVar === 'src' ? src : variables.get(rootVar)
    if (!rootObj) return ''
    return resolvePath(rootObj, segs.join('.')) ?? ''
  }

  // src.A.B.C → resolve on source object
  if (path.startsWith('src.')) {
    const fieldPath = path.slice(4) // remove 'src.'
    return resolvePath(src, fieldPath)
  }

  return trimmed
}

// ── Parse JsonBuilder output structure ──

function parseJsonBuilderBlock(lines, startIdx, variables) {
  const result = {}
  let i = startIdx

  while (i < lines.length) {
    const line = lines[i].trim()
    if (line === '}') return { obj: result, nextIdx: i + 1 }

    // "key" varName  or  key varName
    const leafMatch = line.match(/^"?(\w+)"?\s+(\w+)$/)
    if (leafMatch) {
      const key = leafMatch[1]
      const varName = leafMatch[2]
      result[key] = variables.has(varName) ? variables.get(varName) : varName
      i++
      continue
    }

    // nested {
    const nestedMatch = line.match(/^"?(\w+)"?\s*\{$/)
    if (nestedMatch) {
      const key = nestedMatch[1]
      const { obj, nextIdx } = parseJsonBuilderBlock(lines, i + 1, variables)
      result[key] = obj
      i = nextIdx
      continue
    }

    i++
  }

  return { obj: result, nextIdx: i }
}

// ── Parse MarkupBuilder output structure ──

function parseMarkupBuilderBlock(lines, startIdx, variables) {
  const result = {}
  let i = startIdx

  while (i < lines.length) {
    const line = lines[i].trim()
    if (line === '}') return { obj: result, nextIdx: i + 1 }

    // key(varName)
    const leafMatch = line.match(/^(\w+)\((\w+)\)$/)
    if (leafMatch) {
      const key = leafMatch[1]
      const varName = leafMatch[2]
      result[key] = variables.has(varName) ? variables.get(varName) : varName
      i++
      continue
    }

    // key {
    const nestedMatch = line.match(/^(\w+)\s*\{$/)
    if (nestedMatch) {
      const key = nestedMatch[1]
      const { obj, nextIdx } = parseMarkupBuilderBlock(lines, i + 1, variables)
      result[key] = obj
      i = nextIdx
      continue
    }

    i++
  }

  return { obj: result, nextIdx: i }
}

// ── Convert JS object to formatted XML string ──

function objectToXml(obj, indent = '') {
  let xml = ''
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      xml += `${indent}<${key}>\n${objectToXml(value, indent + '  ')}${indent}</${key}>\n`
    } else {
      const escaped = String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      xml += `${indent}<${key}>${escaped}</${key}>\n`
    }
  }
  return xml
}

// ── Main Entry Point ──

export function executeGroovyMock(inputPayload, groovyScript, sourceFormat, soapFlags = {}) {
  const { isSourceSoap = false, isTargetSoap = false } = soapFlags

  // 1. Parse the input payload
  let src
  try {
    if (sourceFormat === 'xml') {
      src = xmlToJsObject(inputPayload)
      // If SOAP mode, unwrap: navigate into Body's first child
      if (isSourceSoap && src) {
        const body = src['Body'] || src['soapenv:Body'] || src['soap:Body'] || src['SOAP-ENV:Body']
        if (body && typeof body === 'object') {
          const bodyKeys = Object.keys(body)
          if (bodyKeys.length > 0) {
            src = body[bodyKeys[0]]
          }
        }
      }
    } else {
      src = JSON.parse(inputPayload)
    }
  } catch (err) {
    return { error: `Input Parse Error:\n${err.message}` }
  }

  try {
    const lines = groovyScript.split('\n')
    const variables = new Map()
    let outputFormat = 'json' // default
    let outputObj = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      // Skip comments, imports, blanks, boilerplate
      if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') ||
          line.startsWith('import ') || line.startsWith('def Message') ||
          line.startsWith('def Exchange') || line.startsWith('public void') ||
          line.startsWith('def body') || line.startsWith('def src') ||
          line.startsWith('def srcRaw') || line.startsWith('def _bodyEl') ||
          line.startsWith('def _findByLocal') || line.startsWith('_findByLocal =') ||
          line.startsWith('message.') || line.startsWith('exchange.') ||
          line.startsWith('return ') || line.startsWith('def os ') ||
          line.startsWith('os.write') || line.startsWith('def writer') ||
          line.startsWith('xml.mkp') ||
          line === '{' || line === '}' ||
          line.startsWith('for (') || line.startsWith('if (') ||
          line.startsWith('current ') || line === 'current' ||
          line.startsWith('}')) {
        continue
      }

      // Parse: def varName = expression
      const defMatch = line.match(/^def\s+(\w+)\s*=\s*(.+)$/)
      if (defMatch) {
        const varName = defMatch[1]
        const expression = defMatch[2]

        // Skip builder declarations
        if (expression.startsWith('new JsonBuilder') || expression.startsWith('new JsonSlurper') ||
            expression.startsWith('new XmlSlurper') || expression.startsWith('new MarkupBuilder') ||
            expression.startsWith('new StringWriter')) {
          continue
        }

        try {
          const value = evaluateExpression(expression, src, variables)
          variables.set(varName, value ?? '')
        } catch (evalErr) {
          variables.set(varName, `[Error: ${evalErr.message}]`)
        }
        continue
      }

      // Detect output builder start: output {  or  xml {  or  xml.RootTag {
      if (line === 'output {') {
        outputFormat = 'json'
        const { obj } = parseJsonBuilderBlock(lines, i + 1, variables)
        outputObj = obj
        break
      }
      if (line === 'xml {') {
        outputFormat = 'xml'
        const { obj } = parseMarkupBuilderBlock(lines, i + 1, variables)
        outputObj = obj
        break
      }
      // xml.RootTagName { — named root element
      const xmlRootMatch = line.match(/^xml\.(\w+)\s*\{$/)
      if (xmlRootMatch) {
        outputFormat = 'xml'
        const rootTag = xmlRootMatch[1]
        const { obj } = parseMarkupBuilderBlock(lines, i + 1, variables)
        outputObj = { [rootTag]: obj }
        break
      }
    }

    if (!outputObj) {
      return { error: 'Groovy Mock Error:\nCould not find output builder block (JsonBuilder or MarkupBuilder).\nEnsure the script contains an "output {" or "xml {" block.' }
    }

    // 2. Format the output
    if (outputFormat === 'json') {
      return { result: JSON.stringify(outputObj, null, 2) }
    } else {
      let xmlStr = '<?xml version="1.0" encoding="UTF-8"?>\n'
      if (isTargetSoap) {
        xmlStr += '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">\n'
        xmlStr += '  <soapenv:Header/>\n'
        xmlStr += '  <soapenv:Body>\n'
        xmlStr += objectToXml(outputObj, '    ')
        xmlStr += '  </soapenv:Body>\n'
        xmlStr += '</soapenv:Envelope>'
      } else {
        xmlStr += objectToXml(outputObj)
      }
      return { result: xmlStr }
    }
  } catch (err) {
    return { error: `Groovy Runtime Error:\n${err.message}` }
  }
}
