/**
 * Alchem.io Code Generator
 *
 * Reads the ReactFlow graph (nodes + edges) and produces valid
 * XSLT 2.0 and Groovy scripts that reflect the actual canvas mappings.
 *
 * Graph structure:
 *  - source-payload node (handleType=source), handles are dot-path field IDs
 *  - target-payload node (handleType=target), handles are dot-path field IDs
 *  - transform nodes (concat, uppercase, formatDate, constant, replace, ifelse)
 *    with in-{name}/out-{name} handles
 *  - edges connect source handles → transform inputs → transform outputs → target handles
 */

// ── Namespace Extraction ──

/**
 * Extract all namespace declarations from an XML string.
 * Returns a Map of prefix → URI (e.g. "ns1" → "http://myapi.com").
 * The default namespace (xmlns="...") is stored under key "".
 */
function extractNamespacesFromXML(xmlString) {
  const namespaces = new Map()
  if (!xmlString || !xmlString.trim().startsWith('<')) return namespaces

  try {
    const doc = new DOMParser().parseFromString(xmlString, 'application/xml')
    if (doc.querySelector('parsererror')) return namespaces

    // Walk elements to collect all xmlns declarations
    function collectNs(el) {
      for (const attr of el.attributes) {
        if (attr.name === 'xmlns') {
          namespaces.set('', attr.value)
        } else if (attr.name.startsWith('xmlns:')) {
          const prefix = attr.name.slice(6)
          namespaces.set(prefix, attr.value)
        }
      }
      for (const child of el.children) {
        collectNs(child)
      }
    }
    collectNs(doc.documentElement)
  } catch {
    // Silently ignore parse errors
  }
  return namespaces
}

// ── Graph Traversal ──

/**
 * For each target field, trace backwards through edges to find:
 *  - The source field path(s) it maps from
 *  - Any transformation nodes in the chain
 *  - Node data (for constant values, replace-with, etc.)
 *
 * Returns: [{ targetPath, sourcePaths, inputMap, nodeData, transforms }]
 */
function buildMappings(nodes, edges) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const mappings = []

  // Recursively trace backwards from a node to find source-payload handles
  function traceToSource(nodeId, visited) {
    if (visited.has(nodeId)) return [] // prevent infinite loops
    visited.add(nodeId)

    const results = []
    const incomingEdges = edges.filter((e) => e.target === nodeId)

    for (const edge of incomingEdges) {
      const srcNode = nodeMap.get(edge.source)
      if (!srcNode) continue

      const handleName = edge.targetHandle?.replace('in-', '') || 'input'

      if (srcNode.id === 'source-payload') {
        results.push({ handleName, sourcePath: edge.sourceHandle })
      } else if (srcNode.type === 'transform' || srcNode.type === 'udf') {
        // Recurse deeper through chained transforms/UDFs
        const deeper = traceToSource(srcNode.id, visited)
        for (const d of deeper) {
          results.push({ handleName, sourcePath: d.sourcePath })
        }
      }
    }
    return results
  }

  // Find all edges that end at target-payload
  const targetIncoming = edges.filter((e) => e.target === 'target-payload')

  for (const tEdge of targetIncoming) {
    const targetPath = tEdge.targetHandle
    const sourceNodeId = tEdge.source
    const sourceNode = nodeMap.get(sourceNodeId)

    if (!sourceNode) continue

    if (sourceNode.id === 'source-payload') {
      mappings.push({
        targetPath,
        sourcePaths: [tEdge.sourceHandle],
        inputMap: {},
        nodeData: null,
        transforms: [],
      })
    } else if (sourceNode.type === 'transform' || sourceNode.type === 'udf') {
      const traced = traceToSource(sourceNode.id, new Set())
      const sourcePaths = traced.map((t) => t.sourcePath)
      const inputMap = {}
      for (const t of traced) {
        inputMap[t.handleName] = t.sourcePath
      }

      const isUdf = sourceNode.type === 'udf'
      mappings.push({
        targetPath,
        sourcePaths,
        inputMap,
        nodeData: sourceNode.data,
        transforms: [{
          operation: isUdf ? 'udf' : sourceNode.data.operation,
          nodeId: sourceNode.id,
          ...(isUdf ? { udfName: sourceNode.data.name, udfArgs: sourceNode.data.args, udfCode: sourceNode.data.code } : {}),
        }],
      })
    }
  }

  return mappings
}

// ── Path Helpers ──

/** Convert dot-path to proper XPath (e.g. "Body.Customer.name" → "Body/Customer/name") */
function dotToXPath(dotPath) {
  return dotPath.replace(/\./g, '/')
}

/** Build a contextual XPath select expression for a source field */
function buildXPathExpr(dotPath, sourceFormat) {
  if (sourceFormat === 'xml') {
    // Full XPath from root element: PayloadRequest/Header/MessageId
    return dotToXPath(dotPath)
  }
  // JSON: use json-to-xml or simple path reference
  return `$json//${dotPath.split('.').pop()}`
}

function dotToGroovyChain(dotPath) {
  return dotPath.split('.').join('.')
}

// ── XSLT 1.0 Helpers ──

const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Build an XSLT 1.0 date-format expression using substring manipulation.
 * Assumes input date is in yyyy-MM-dd or yyyy-MM-ddTHH:mm:ssZ format.
 */
function buildXslt1DateFormat(srcExpr, javaFmt) {
  // Extract date parts via XSLT 1.0 substring
  const year = `substring(${srcExpr}, 1, 4)`
  const month = `substring(${srcExpr}, 6, 2)`
  const day = `substring(${srcExpr}, 9, 2)`

  switch (javaFmt) {
    case 'MM/dd/yyyy':
      return `concat(${month}, '/', ${day}, '/', ${year})`
    case 'dd.MM.yyyy':
      return `concat(${day}, '.', ${month}, '.', ${year})`
    case "yyyy-MM-dd'T'HH:mm:ss'Z'":
      // If the source already has time, pass through; otherwise append T00:00:00Z
      return `concat(substring(${srcExpr}, 1, 10), 'T', substring(${srcExpr}, 12, 8), 'Z')`
    case 'yyyy-MM-dd':
    default:
      return `substring(${srcExpr}, 1, 10)`
  }
}

// ── XSLT Transform Wrappers ──

function buildXsltSelectExpr(mapping, sourceFormat) {
  const m = mapping
  if (m.transforms.length === 0) {
    // Direct mapping
    return buildXPathExpr(m.sourcePaths[0], sourceFormat)
  }

  const op = m.transforms[0].operation

  switch (op) {
    case 'constant':
      return `'${(m.nodeData?.constantValue || '').replace(/'/g, "''")}'`

    case 'uppercase': {
      const src = m.sourcePaths[0]
      return `translate(${buildXPathExpr(src, sourceFormat)}, '${LOWER}', '${UPPER}')`
    }

    case 'formatDate': {
      const src = m.sourcePaths[0]
      const fmt = m.nodeData?.format || 'yyyy-MM-dd'
      const srcExpr = buildXPathExpr(src, sourceFormat)
      return buildXslt1DateFormat(srcExpr, fmt)
    }

    case 'concat': {
      const pathA = m.inputMap['a'] || m.sourcePaths[0]
      const pathB = m.inputMap['b'] || m.sourcePaths[1]
      if (!pathA || !pathB) {
        return buildXPathExpr(m.sourcePaths[0] || '', sourceFormat)
      }
      return `concat(${buildXPathExpr(pathA, sourceFormat)}, ' ', ${buildXPathExpr(pathB, sourceFormat)})`
    }

    case 'replace': {
      // XSLT 1.0: replace is handled via named template call-template in renderTargetElement
      // Return null to signal special handling
      const srcPath = m.inputMap['source'] || m.sourcePaths[0]
      if (!srcPath) return "''"
      return buildXPathExpr(srcPath, sourceFormat)
    }

    case 'ifelse': {
      // Handled via xsl:choose in renderTargetElement — return placeholder
      return "''"
    }

    case 'math': {
      const pathA = m.inputMap['a'] || m.sourcePaths[0]
      const pathB = m.inputMap['b'] || m.sourcePaths[1]
      const op = m.nodeData?.mathOperator || '+'
      const exprA = pathA ? `number(${buildXPathExpr(pathA, sourceFormat)})` : '0'
      const exprB = pathB ? `number(${buildXPathExpr(pathB, sourceFormat)})` : '0'
      const xpathOps = { '+': '+', '-': '-', '*': '*', '/': 'div' }
      return `${exprA} ${xpathOps[op] || '+'} ${exprB}`
    }

    case 'substring': {
      const srcPath = m.inputMap['source'] || m.sourcePaths[0]
      const startVal = m.nodeData?.substringStart ?? 0
      const lenVal = m.nodeData?.substringLength ?? 5
      const srcExpr = srcPath ? buildXPathExpr(srcPath, sourceFormat) : "''"
      // XSLT substring is 1-based, so add 1 to the 0-based user input
      const startExpr = `${Number(startVal) + 1}`
      const lenExpr = `${Number(lenVal)}`
      return `substring(${srcExpr}, ${startExpr}, ${lenExpr})`
    }

    case 'equals': {
      const pathA = m.inputMap['valueA'] || m.sourcePaths[0]
      const pathB = m.inputMap['valueB'] || m.sourcePaths[1]
      const exprA = pathA ? buildXPathExpr(pathA, sourceFormat) : "''"
      const exprB = pathB ? buildXPathExpr(pathB, sourceFormat) : "''"
      return `${exprA} = ${exprB}`
    }

    case 'udf': {
      // XSLT cannot execute custom code — pass through first source as fallback
      const src = m.sourcePaths[0]
      return src ? buildXPathExpr(src, sourceFormat) : "''"
    }

    default:
      return buildXPathExpr(m.sourcePaths[0] || '', sourceFormat)
  }
}

// ── XSLT Generator ──

export function generateXSLT(nodes, edges, sourceFormat, targetFormat, soapFlags = {}, sourceXml = '') {
  const { isSourceSoap = false, isTargetSoap = false } = soapFlags
  const mappings = buildMappings(nodes, edges)

  if (mappings.length === 0) {
    return '<!-- No mappings defined. Connect source fields to target fields on the canvas. -->'
  }

  // Track whether we need the string-replace named template
  let needsReplaceTemplate = false

  // Build nested target XML tree from mapping paths
  const targetTree = {}
  for (const m of mappings) {
    const parts = m.targetPath.split('.')
    let current = targetTree
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = { __children: {} }
      if (current[parts[i]].__children) {
        current = current[parts[i]].__children
      } else {
        current = current[parts[i]]
      }
    }
    current[parts[parts.length - 1]] = { __mapping: m }
  }

  function renderTargetElement(tree, indent) {
    const lines = []
    for (const [key, value] of Object.entries(tree)) {
      if (value.__mapping) {
        // Leaf mapping
        const m = value.__mapping
        const op = m.transforms.length > 0 ? m.transforms[0].operation : null

        // ifelse → xsl:choose
        if (op === 'ifelse') {
          const condPath = m.inputMap['condition'] || m.sourcePaths[0]
          const truePath = m.inputMap['true'] || m.sourcePaths[1]
          const falsePath = m.inputMap['false'] || m.sourcePaths[2]
          const condExpr = condPath ? buildXPathExpr(condPath, sourceFormat) : 'true()'
          const trueExpr = truePath ? buildXPathExpr(truePath, sourceFormat) : "''"
          const falseExpr = falsePath ? buildXPathExpr(falsePath, sourceFormat) : "''"

          lines.push(`${indent}<${key}>`)
          lines.push(`${indent}  <xsl:choose>`)
          lines.push(`${indent}    <xsl:when test="${condExpr}">`)
          lines.push(`${indent}      <xsl:value-of select="${trueExpr}"/>`)
          lines.push(`${indent}    </xsl:when>`)
          lines.push(`${indent}    <xsl:otherwise>`)
          lines.push(`${indent}      <xsl:value-of select="${falseExpr}"/>`)
          lines.push(`${indent}    </xsl:otherwise>`)
          lines.push(`${indent}  </xsl:choose>`)
          lines.push(`${indent}</${key}>`)
        }
        // replace → call-template (XSLT 1.0 has no replace function)
        else if (op === 'replace') {
          needsReplaceTemplate = true
          const srcPath = m.inputMap['source'] || m.sourcePaths[0]
          const searchFor = m.nodeData?.searchFor || ''
          const replaceWith = m.nodeData?.replaceWith || ''
          const srcExpr = srcPath ? buildXPathExpr(srcPath, sourceFormat) : "''"

          lines.push(`${indent}<${key}>`)
          lines.push(`${indent}  <xsl:call-template name="string-replace">`)
          lines.push(`${indent}    <xsl:with-param name="text" select="${srcExpr}"/>`)
          lines.push(`${indent}    <xsl:with-param name="search" select="'${searchFor.replace(/'/g, "''")}'"/>`)
          lines.push(`${indent}    <xsl:with-param name="replace" select="'${replaceWith.replace(/'/g, "''")}'"/>`)
          lines.push(`${indent}  </xsl:call-template>`)
          lines.push(`${indent}</${key}>`)
        }
        // All other operations → xsl:value-of
        else {
          const selectExpr = buildXsltSelectExpr(m, sourceFormat)
          lines.push(`${indent}<${key}>`)
          lines.push(`${indent}  <xsl:value-of select="${selectExpr}"/>`)
          lines.push(`${indent}</${key}>`)
        }
      } else {
        // Nested element — recurse into children
        const children = value.__children || value
        lines.push(`${indent}<${key}>`)
        lines.push(...renderTargetElement(children, indent + '  '))
        lines.push(`${indent}</${key}>`)
      }
    }
    return lines
  }

  // Build the output body — always wrap in the true root element
  // The schema parser unwraps the XML root for cleaner canvas display,
  // so handle IDs start from children (e.g. Table.RDFD_KODU).
  // We must re-wrap in the actual root tag for valid XSLT output.
  const targetNode = nodes.find((n) => n.id === 'target-payload')
  const targetRootTag = targetNode?.data?.rootTag || null

  let bodyLines
  if (targetRootTag) {
    // Re-wrap in the true root element that was unwrapped during parsing
    bodyLines = [`      <${targetRootTag}>`]
    bodyLines.push(...renderTargetElement(targetTree, '        '))
    bodyLines.push(`      </${targetRootTag}>`)
  } else {
    // JSON target or no rootTag — check if we need a synthetic root
    const topKeys = Object.keys(targetTree)
    if (topKeys.length > 1) {
      bodyLines = ['      <Root>']
      bodyLines.push(...renderTargetElement(targetTree, '        '))
      bodyLines.push('      </Root>')
    } else {
      bodyLines = renderTargetElement(targetTree, '      ')
    }
  }

  // Determine root match pattern based on source format and SOAP
  let matchPattern
  if (isSourceSoap && sourceFormat === 'xml') {
    matchPattern = '/soapenv:Envelope/soapenv:Body/*'
  } else {
    matchPattern = sourceFormat === 'xml' ? '/*' : '/'
  }

  // Compute source root element name for documentation
  const sourceFields = mappings.flatMap((m) => m.sourcePaths).filter(Boolean)
  const rootElements = [...new Set(sourceFields.map((p) => p.split('.')[0]))]

  // Build the string-replace named template if needed
  const replaceTemplate = needsReplaceTemplate ? `

  <!-- XSLT 1.0 string-replace template -->
  <xsl:template name="string-replace">
    <xsl:param name="text"/>
    <xsl:param name="search"/>
    <xsl:param name="replace"/>
    <xsl:choose>
      <xsl:when test="contains($text, $search)">
        <xsl:value-of select="substring-before($text, $search)"/>
        <xsl:value-of select="$replace"/>
        <xsl:call-template name="string-replace">
          <xsl:with-param name="text" select="substring-after($text, $search)"/>
          <xsl:with-param name="search" select="$search"/>
          <xsl:with-param name="replace" select="$replace"/>
        </xsl:call-template>
      </xsl:when>
      <xsl:otherwise>
        <xsl:value-of select="$text"/>
      </xsl:otherwise>
    </xsl:choose>
  </xsl:template>` : ''

  // Collect namespace declarations for the stylesheet
  const reservedPrefixes = new Set(['xsl', 'xml'])
  const nsAttrs = []

  // SOAP namespace
  if (isSourceSoap || isTargetSoap) {
    nsAttrs.push('xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"')
    reservedPrefixes.add('soapenv')
  }

  // Extract custom namespaces from source XML
  if (sourceFormat === 'xml' && sourceXml) {
    const extracted = extractNamespacesFromXML(sourceXml)
    for (const [prefix, uri] of extracted) {
      if (!prefix) continue // skip default namespace — not useful in XPath 1.0
      if (reservedPrefixes.has(prefix)) continue
      nsAttrs.push(`xmlns:${prefix}="${uri}"`)
      reservedPrefixes.add(prefix)
    }
  }

  const extraNsBlock = nsAttrs.length > 0
    ? '\n' + nsAttrs.map((a) => `    ${a}`).join('\n')
    : ''

  // Wrap body in SOAP envelope if target needs it
  let finalBodyLines
  if (isTargetSoap) {
    finalBodyLines = [
      '      <soapenv:Envelope>',
      '        <soapenv:Header/>',
      '        <soapenv:Body>',
      ...bodyLines.map((l) => '    ' + l),
      '        </soapenv:Body>',
      '      </soapenv:Envelope>',
    ]
  } else {
    finalBodyLines = bodyLines
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Alchem.io — Auto-generated XSLT 1.0 (Browser-compatible)
  Source: ${sourceFormat.toUpperCase()}${isSourceSoap ? ' (SOAP)' : ''} → Target: ${targetFormat.toUpperCase()}${isTargetSoap ? ' (SOAP)' : ''}
  Mappings: ${mappings.length} field(s)
  Source root(s): ${rootElements.join(', ') || 'N/A'}
-->
<xsl:stylesheet version="1.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"${extraNsBlock}>

  <xsl:output method="xml" indent="yes" encoding="UTF-8"/>

  <xsl:template match="${matchPattern}">
${finalBodyLines.join('\n')}
  </xsl:template>${replaceTemplate}

</xsl:stylesheet>`
}

// ── Groovy Generator ──

// Platform-specific boilerplate
const PLATFORM_CONFIG = {
  'sap-cpi': {
    imports: ['import com.sap.gateway.ip.core.customdev.util.Message'],
    fnSignature: 'def Message processData(Message message) {',
    getBody: '    def body = message.getBody(String)',
    setBody: (contentType) => [
      `    message.setBody(%OUTPUT%)`,
      `    message.setHeader("Content-Type", "${contentType}")`,
    ],
    returnStmt: '    return message',
  },
  'sap-po': {
    imports: ['import com.sap.aii.mapping.api.*'],
    fnSignature: 'public void transform(TransformationInput input, TransformationOutput output) throws StreamTransformationException {',
    getBody: '    def body = new String(input.getInputPayload().getInputStream().readAllBytes(), "UTF-8")',
    setBody: (_contentType) => [
      '    def os = output.getOutputPayload().getOutputStream()',
      '    os.write(%OUTPUT%.getBytes("UTF-8"))',
    ],
    returnStmt: null,
  },
  'apache-camel': {
    imports: ['import org.apache.camel.Exchange'],
    fnSignature: 'def Exchange executeMessage(Exchange exchange) {',
    getBody: '    def body = exchange.getIn().getBody(String)',
    setBody: (contentType) => [
      `    exchange.getIn().setBody(%OUTPUT%)`,
      `    exchange.getIn().setHeader("Content-Type", "${contentType}")`,
    ],
    returnStmt: '    return exchange',
  },
}

function groovyTransformExpr(accessor, operation, nodeData) {
  switch (operation) {
    case 'uppercase':
      return `${accessor}.toString().toUpperCase()`
    case 'formatDate': {
      const fmt = nodeData?.format || 'yyyy-MM-dd'
      return `Date.parse("yyyy-MM-dd", ${accessor}.toString()).format("${fmt.replace(/"/g, '\\"')}")`
    }
    case 'constant':
      return `"${(nodeData?.constantValue || '').replace(/"/g, '\\"')}"`
    default:
      return accessor
  }
}

function buildGroovyAccessor(dotPath, sourceFormat, sourceRootTag) {
  const chain = dotToGroovyChain(dotPath)
  if (sourceFormat === 'xml') {
    // XmlSlurper parses from root, so we use src.path.text()
    // If root was unwrapped (XML), the path starts after root, so accessor is correct
    return `src.${chain}.text()`
  }
  return `src.${chain}`
}

export function generateGroovy(nodes, edges, sourceFormat, targetFormat, platform = 'sap-cpi', soapFlags = {}) {
  const { isSourceSoap = false, isTargetSoap = false } = soapFlags
  const mappings = buildMappings(nodes, edges)

  if (mappings.length === 0) {
    return '// No mappings defined. Connect source fields to target fields on the canvas.'
  }

  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG['sap-cpi']
  const lines = []

  // ── Imports ──
  config.imports.forEach((imp) => lines.push(imp))
  if (sourceFormat === 'json' || targetFormat === 'json') {
    lines.push('import groovy.json.JsonSlurper')
    lines.push('import groovy.json.JsonBuilder')
  }
  if (sourceFormat === 'xml' || targetFormat === 'xml') {
    lines.push('import groovy.xml.XmlSlurper')
    lines.push('import groovy.xml.MarkupBuilder')
  }
  lines.push('')
  lines.push('/**')
  lines.push(` * Alchem.io — Auto-generated Groovy Mapping Script`)
  lines.push(` * Platform: ${platform.toUpperCase()}`)
  lines.push(` * Source: ${sourceFormat.toUpperCase()} → Target: ${targetFormat.toUpperCase()}`)
  lines.push(` * Mappings: ${mappings.length} field(s)`)
  lines.push(' */')

  // ── Inject UDF function definitions ──
  const udfDefs = new Set()
  for (const m of mappings) {
    if (m.transforms.length > 0 && m.transforms[0].operation === 'udf') {
      const t = m.transforms[0]
      if (!udfDefs.has(t.udfName)) {
        udfDefs.add(t.udfName)
        lines.push(`// ─── UDF: ${t.udfName} ───`)
        lines.push(`def ${t.udfName}(${t.udfArgs.join(', ')}) {`)
        const codeLines = (t.udfCode || '').split('\n')
        for (const cl of codeLines) {
          lines.push(`    ${cl}`)
        }
        lines.push('}')
        lines.push('')
      }
    }
  }

  // ── Function signature ──
  lines.push(config.fnSignature)
  lines.push(config.getBody)
  lines.push('')

  // ── Parse source ──
  if (sourceFormat === 'json') {
    lines.push('    // Parse source JSON')
    lines.push('    def src = new JsonSlurper().parseText(body)')
  } else {
    lines.push('    // Parse source XML')
    lines.push('    def srcRaw = new XmlSlurper().parseText(body)')
    if (isSourceSoap) {
      lines.push('    // Unwrap SOAP Envelope — navigate into Body\'s first child')
      lines.push("    def src = srcRaw.Body.children()[0]")
    } else {
      lines.push('    def src = srcRaw')
    }
  }
  lines.push('')

  // ── Field Mappings (deduplicated) ──
  // Build unique variable names — if two target paths produce the same
  // varName (e.g. different parent paths), suffix with _N to avoid collisions
  lines.push('    // ─── Field Mappings ───')
  const varNames = new Map()        // targetPath → unique varName
  const usedVarNames = new Set()    // track used names to prevent duplicates
  const emittedTargets = new Set()   // track emitted target paths

  for (const m of mappings) {
    // Skip if this target path was already mapped (dedup)
    if (emittedTargets.has(m.targetPath)) continue
    emittedTargets.add(m.targetPath)

    const targetField = m.targetPath.split('.').pop()
    let varName = targetField.replace(/[^a-zA-Z0-9_]/g, '_')

    // Ensure unique variable name
    if (usedVarNames.has(varName)) {
      let suffix = 2
      while (usedVarNames.has(`${varName}_${suffix}`)) suffix++
      varName = `${varName}_${suffix}`
    }
    usedVarNames.add(varName)
    varNames.set(m.targetPath, varName)

    // Generate the single variable declaration for this mapping
    if (m.transforms.length > 0) {
      const op = m.transforms[0].operation

      if (op === 'constant') {
        lines.push(`    def ${varName} = "${(m.nodeData?.constantValue || '').replace(/"/g, '\\"')}"`)
      } else if (op === 'concat') {
        const pathA = m.inputMap?.['a'] || m.sourcePaths[0]
        const pathB = m.inputMap?.['b'] || m.sourcePaths[1]
        if (pathA && pathB) {
          const accessorA = buildGroovyAccessor(pathA, sourceFormat)
          const accessorB = buildGroovyAccessor(pathB, sourceFormat)
          lines.push(`    def ${varName} = "${'\u0024{' + accessorA + '}'} ${'\u0024{' + accessorB + '}'}"`)
        } else {
          lines.push(`    def ${varName} = ""  // concat: missing input(s)`)
        }
      } else if (op === 'replace') {
        const srcPath = m.inputMap?.['source'] || m.sourcePaths[0]
        const searchFor = m.nodeData?.searchFor || ''
        const replaceWith = m.nodeData?.replaceWith || ''
        if (srcPath && searchFor) {
          const accessor = buildGroovyAccessor(srcPath, sourceFormat)
          lines.push(`    def ${varName} = ${accessor}.toString().replace("${searchFor.replace(/"/g, '\\"')}", "${replaceWith.replace(/"/g, '\\"')}")`)
        } else if (srcPath) {
          const accessor = buildGroovyAccessor(srcPath, sourceFormat)
          lines.push(`    def ${varName} = ${accessor}`)
        }
      } else if (op === 'ifelse') {
        const condPath = m.inputMap?.['condition'] || m.sourcePaths[0]
        const truePath = m.inputMap?.['true'] || m.sourcePaths[1]
        const falsePath = m.inputMap?.['false'] || m.sourcePaths[2]
        const condAccessor = condPath ? buildGroovyAccessor(condPath, sourceFormat) : 'true'
        const trueAccessor = truePath ? buildGroovyAccessor(truePath, sourceFormat) : '""'
        const falseAccessor = falsePath ? buildGroovyAccessor(falsePath, sourceFormat) : '""'
        lines.push(`    def ${varName} = ${condAccessor} ? ${trueAccessor} : ${falseAccessor}`)
      } else if (op === 'formatDate') {
        const srcPath = m.inputMap?.['input'] || m.sourcePaths[0]
        const fmt = m.nodeData?.format || 'yyyy-MM-dd'
        if (srcPath) {
          const accessor = buildGroovyAccessor(srcPath, sourceFormat)
          lines.push(`    def ${varName} = Date.parse("yyyy-MM-dd", ${accessor}.toString()).format("${fmt.replace(/"/g, '\\"')}")`)
        } else {
          lines.push(`    def ${varName} = ""  // formatDate: missing input`)
        }
      } else if (op === 'math') {
        const pathA = m.inputMap?.['a'] || m.sourcePaths[0]
        const pathB = m.inputMap?.['b'] || m.sourcePaths[1]
        const mathOp = m.nodeData?.mathOperator || '+'
        const accA = pathA ? `(${buildGroovyAccessor(pathA, sourceFormat)} as BigDecimal)` : '0'
        const accB = pathB ? `(${buildGroovyAccessor(pathB, sourceFormat)} as BigDecimal)` : '0'
        lines.push(`    def ${varName} = ${accA} ${mathOp} ${accB}`)
      } else if (op === 'substring') {
        const srcPath = m.inputMap?.['source'] || m.sourcePaths[0]
        const startVal = m.nodeData?.substringStart ?? 0
        const lenVal = m.nodeData?.substringLength ?? 5
        const srcAcc = srcPath ? `${buildGroovyAccessor(srcPath, sourceFormat)}.toString()` : '""'
        lines.push(`    def ${varName} = ${srcAcc}.substring(${Number(startVal)}, Math.min(${Number(startVal)} + ${Number(lenVal)}, ${srcAcc}.length()))`)
      } else if (op === 'equals') {
        const pathA = m.inputMap?.['valueA'] || m.sourcePaths[0]
        const pathB = m.inputMap?.['valueB'] || m.sourcePaths[1]
        const accA = pathA ? `${buildGroovyAccessor(pathA, sourceFormat)}.toString()` : '""'
        const accB = pathB ? `${buildGroovyAccessor(pathB, sourceFormat)}.toString()` : '""'
        lines.push(`    def ${varName} = ${accA} == ${accB}`)
      } else if (op === 'udf') {
        const t = m.transforms[0]
        const udfArgs = (t.udfArgs || []).map((argName) => {
          const srcPath = m.inputMap?.[argName] || m.sourcePaths[0]
          return srcPath ? buildGroovyAccessor(srcPath, sourceFormat) : '""'
        })
        lines.push(`    def ${varName} = ${t.udfName}(${udfArgs.join(', ')})`)
      } else {
        // Generic transform (uppercase, formatDate, etc.)
        const srcPath = m.sourcePaths[0]
        if (!srcPath) continue
        const accessor = buildGroovyAccessor(srcPath, sourceFormat)
        const expr = groovyTransformExpr(accessor, op, m.nodeData)
        lines.push(`    def ${varName} = ${expr}`)
      }
    } else {
      // Direct mapping — no transform
      const srcPath = m.sourcePaths[0]
      if (!srcPath) continue
      const accessor = buildGroovyAccessor(srcPath, sourceFormat)
      lines.push(`    def ${varName} = ${accessor}`)
    }
  }

  lines.push('')
  lines.push('    // ─── Build Output Payload ───')

  // ── Build target structure tree (using deduplicated varNames) ──
  const targetTree = {}
  for (const m of mappings) {
    if (!varNames.has(m.targetPath)) continue // skip duplicates
    const parts = m.targetPath.split('.')
    let current = targetTree
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = { __children: {} }
      current = current[parts[i]].__children || current[parts[i]]
    }
    current[parts[parts.length - 1]] = { __leaf: true, varName: varNames.get(m.targetPath) }
  }

  const contentType = targetFormat === 'json' ? 'application/json' : 'application/xml'

  // Get true root tag from target node (unwrapped during parsing)
  const groovyTargetNode = nodes.find((n) => n.id === 'target-payload')
  const groovyTargetRoot = groovyTargetNode?.data?.rootTag || null

  if (targetFormat === 'json') {
    lines.push('    def output = new JsonBuilder()')
    lines.push('    output {')

    function renderJsonBuilder(tree, indent) {
      for (const [key, val] of Object.entries(tree)) {
        if (val.__leaf) {
          lines.push(`${indent}"${key}" ${val.varName}`)
        } else {
          const children = val.__children || val
          lines.push(`${indent}${key} {`)
          renderJsonBuilder(children, indent + '    ')
          lines.push(`${indent}}`)
        }
      }
    }

    if (groovyTargetRoot) {
      lines.push(`        ${groovyTargetRoot} {`)
      renderJsonBuilder(targetTree, '            ')
      lines.push('        }')
    } else {
      renderJsonBuilder(targetTree, '        ')
    }
    lines.push('    }')
    lines.push('')
    const setBodyLines = config.setBody(contentType)
    setBodyLines.forEach((l) => lines.push(l.replace('%OUTPUT%', 'output.toPrettyString()')))
  } else {
    lines.push('    def writer = new StringWriter()')
    lines.push('    def xml = new MarkupBuilder(writer)')
    lines.push('    xml.mkp.xmlDeclaration(version: "1.0", encoding: "UTF-8")')
    lines.push('')

    function renderMarkupBuilder(tree, indent) {
      for (const [key, val] of Object.entries(tree)) {
        if (val.__leaf) {
          lines.push(`${indent}${key}(${val.varName})`)
        } else {
          const children = val.__children || val
          lines.push(`${indent}${key} {`)
          renderMarkupBuilder(children, indent + '    ')
          lines.push(`${indent}}`)
        }
      }
    }

    if (isTargetSoap) {
      lines.push("    xml.'soapenv:Envelope'('xmlns:soapenv': 'http://schemas.xmlsoap.org/soap/envelope/') {")
      lines.push("        'soapenv:Header'()")
      lines.push("        'soapenv:Body' {")
      if (groovyTargetRoot) {
        lines.push(`            ${groovyTargetRoot} {`)
        renderMarkupBuilder(targetTree, '                ')
        lines.push('            }')
      } else {
        renderMarkupBuilder(targetTree, '            ')
      }
      lines.push('        }')
      lines.push('    }')
    } else {
      if (groovyTargetRoot) {
        lines.push(`    xml.${groovyTargetRoot} {`)
        renderMarkupBuilder(targetTree, '        ')
        lines.push('    }')
      } else {
        lines.push('    xml {')
        renderMarkupBuilder(targetTree, '        ')
        lines.push('    }')
      }
    }
    lines.push('')
    const setBodyLines = config.setBody(contentType)
    setBodyLines.forEach((l) => lines.push(l.replace('%OUTPUT%', 'writer.toString()')))
  }

  lines.push('')
  if (config.returnStmt) lines.push(config.returnStmt)
  lines.push('}')

  return lines.join('\n')
}
