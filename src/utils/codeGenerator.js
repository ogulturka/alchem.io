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

/**
 * Convert dot-path to namespace-agnostic XPath using local-name().
 * e.g. "Body.Customer.name" → "*[local-name()='Body']/*[local-name()='Customer']/*[local-name()='name']"
 * Strips any prefix (e.g. "diffgr:diffgram" → "diffgram") so it matches
 * regardless of how xmlns is declared in the source XML.
 */
function dotToXPath(dotPath) {
  return dotPath.split('.').map((seg) => {
    const localName = seg.includes(':') ? seg.split(':').pop() : seg
    return `*[local-name()='${localName}']`
  }).join('/')
}

/** Build a contextual XPath select expression for a source field */
function buildXPathExpr(dotPath, sourceFormat) {
  if (sourceFormat === 'xml') {
    return dotToXPath(dotPath)
  }
  // JSON: use json-to-xml or simple path reference
  return `$json//${dotPath.split('.').pop()}`
}

function dotToGroovyChain(dotPath) {
  return dotPath.split('.').join('.')
}

/** Convert a single segment to local-name XPath step */
function segToLocalName(seg) {
  const localName = seg.includes(':') ? seg.split(':').pop() : seg
  return `*[local-name()='${localName}']`
}

// ── Array Loop Inference ──

/**
 * Collect all array paths from the schema tree.
 * Returns a Set of dot-paths that are marked isArray.
 */
function collectArrayPaths(tree, parentPath) {
  const paths = new Set()
  for (const item of tree) {
    const name = item.field || item.label || ''
    const path = parentPath ? `${parentPath}.${name}` : name
    if (item.isArray) paths.add(path)
    if (item.children) {
      for (const p of collectArrayPaths(item.children, path)) {
        paths.add(p)
      }
    }
  }
  return paths
}

/**
 * For a target array path, find the common source array parent
 * by looking at mappings whose target path starts with the array path.
 * Returns the longest common source prefix that likely represents the source array.
 */
function inferSourceArrayPath(targetArrayPath, mappings) {
  const childMappings = mappings.filter((m) =>
    m.targetPath.startsWith(targetArrayPath + '.') && m.sourcePaths.length > 0
  )
  if (childMappings.length === 0) return null

  // Find the common prefix of all source paths
  const sourcePaths = childMappings.map((m) => m.sourcePaths[0]).filter(Boolean)
  if (sourcePaths.length === 0) return null

  const firstParts = sourcePaths[0].split('.')
  let commonLen = firstParts.length - 1 // exclude the leaf field
  for (const sp of sourcePaths.slice(1)) {
    const parts = sp.split('.')
    const maxCheck = Math.min(commonLen, parts.length - 1)
    let match = 0
    while (match < maxCheck && parts[match] === firstParts[match]) match++
    commonLen = match
  }

  if (commonLen <= 0) return null
  return firstParts.slice(0, commonLen).join('.')
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

  // Collect array paths from the target schema tree
  const targetNode = nodes.find((n) => n.id === 'target-payload')
  const targetSchemaTree = targetNode?.data?.tree || []
  const targetArrayPaths = collectArrayPaths(targetSchemaTree, '')

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

  /**
   * Build an XPath expression for a mapping, optionally relative to a loop context.
   * When insideLoop is a source array prefix, strip it and use relative path.
   */
  function buildSelectExpr(m, insideLoop) {
    if (insideLoop && m.sourcePaths[0]) {
      const sp = m.sourcePaths[0]
      // If the source path starts with the loop prefix, make it relative
      if (sp.startsWith(insideLoop + '.')) {
        const relPath = sp.slice(insideLoop.length + 1)
        return segToLocalName(relPath)
      }
    }
    return buildXsltSelectExpr(m, sourceFormat)
  }

  function renderLeafMapping(m, key, indent, insideLoop) {
    const lines = []
    const op = m.transforms.length > 0 ? m.transforms[0].operation : null

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
    } else if (op === 'replace') {
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
    } else {
      const selectExpr = buildSelectExpr(m, insideLoop)
      lines.push(`${indent}<${key}>`)
      lines.push(`${indent}  <xsl:value-of select="${selectExpr}"/>`)
      lines.push(`${indent}</${key}>`)
    }
    return lines
  }

  function renderTargetElement(tree, indent, currentPath, insideLoop) {
    const lines = []
    for (const [key, value] of Object.entries(tree)) {
      const nodePath = currentPath ? `${currentPath}.${key}` : key

      if (value.__mapping) {
        lines.push(...renderLeafMapping(value.__mapping, key, indent, insideLoop))
      } else {
        // Nested element — check if this is an array node
        const children = value.__children || value
        const isArray = targetArrayPaths.has(nodePath)

        if (isArray && sourceFormat === 'xml') {
          // Infer the source array to loop over
          const srcArrayPath = inferSourceArrayPath(nodePath, mappings)
          if (srcArrayPath) {
            const srcArrayXPath = dotToXPath(srcArrayPath)
            lines.push(`${indent}<xsl:for-each select="${srcArrayXPath}">`)
            lines.push(`${indent}  <${key}>`)
            lines.push(...renderTargetElement(children, indent + '    ', nodePath, srcArrayPath))
            lines.push(`${indent}  </${key}>`)
            lines.push(`${indent}</xsl:for-each>`)
          } else {
            // Can't infer source array — fall back to normal rendering
            lines.push(`${indent}<${key}>`)
            lines.push(...renderTargetElement(children, indent + '  ', nodePath, insideLoop))
            lines.push(`${indent}</${key}>`)
          }
        } else {
          lines.push(`${indent}<${key}>`)
          lines.push(...renderTargetElement(children, indent + '  ', nodePath, insideLoop))
          lines.push(`${indent}</${key}>`)
        }
      }
    }
    return lines
  }

  // Build the output body — always wrap in the true root element
  const targetRootTag = targetNode?.data?.rootTag || null

  let bodyLines
  if (targetRootTag) {
    bodyLines = [`      <${targetRootTag}>`]
    bodyLines.push(...renderTargetElement(targetTree, '        ', '', null))
    bodyLines.push(`      </${targetRootTag}>`)
  } else {
    const topKeys = Object.keys(targetTree)
    if (topKeys.length > 1) {
      bodyLines = ['      <Root>']
      bodyLines.push(...renderTargetElement(targetTree, '        ', '', null))
      bodyLines.push('      </Root>')
    } else {
      bodyLines = renderTargetElement(targetTree, '      ', '', null)
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

function buildGroovyAccessor(dotPath, sourceFormat) {
  if (sourceFormat === 'xml') {
    // Namespace-agnostic lookup: strip prefixes, use _findByLocal helper
    const segs = dotPath.split('.').map((s) => s.includes(':') ? s.split(':').pop() : s)
    const list = segs.map((s) => `'${s}'`).join(', ')
    return `(_findByLocal(src, [${list}])?.text() ?: '')`
  }
  const chain = dotToGroovyChain(dotPath)
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
    lines.push('')
    lines.push('    // Namespace-agnostic field lookup (mirrors XSLT local-name() behavior)')
    lines.push('    def _findByLocal')
    lines.push('    _findByLocal = { root, pathList ->')
    lines.push('        def current = root')
    lines.push('        for (name in pathList) {')
    lines.push('            if (current == null) break')
    lines.push("            current = current.children().find { it?.name()?.toString()?.replaceAll(/^[^:]+:/, '') == name }")
    lines.push('        }')
    lines.push('        current')
    lines.push('    }')
    if (isSourceSoap) {
      lines.push('')
      lines.push('    // Unwrap SOAP Envelope — find <Body> regardless of namespace prefix')
      lines.push("    def _bodyEl = _findByLocal(srcRaw, ['Body'])")
      lines.push('    def src = _bodyEl?.children()?.getAt(0) ?: srcRaw')
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

  // Collect target array paths for Groovy loop detection
  const groovyTargetNode = nodes.find((n) => n.id === 'target-payload')
  const groovyTargetSchemaTree = groovyTargetNode?.data?.tree || []
  const groovyArrayPaths = collectArrayPaths(groovyTargetSchemaTree, '')

  // ── Build target structure tree (using deduplicated varNames) ──
  // Also store the original mapping for array children (used for inline access)
  const targetTree = {}
  for (const m of mappings) {
    if (!varNames.has(m.targetPath)) continue
    const parts = m.targetPath.split('.')
    let current = targetTree
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = { __children: {} }
      current = current[parts[i]].__children || current[parts[i]]
    }
    current[parts[parts.length - 1]] = { __leaf: true, varName: varNames.get(m.targetPath), __mapping: m }
  }

  const contentType = targetFormat === 'json' ? 'application/json' : 'application/xml'
  const groovyTargetRoot = groovyTargetNode?.data?.rootTag || null

  /** Build inline Groovy accessor for a field relative to a loop item variable */
  function groovyInlineAccessor(mapping, loopVar, srcArrayPath) {
    const sp = mapping.sourcePaths[0]
    if (!sp) return '""'
    if (sp.startsWith(srcArrayPath + '.')) {
      const relField = sp.slice(srcArrayPath.length + 1)
      if (sourceFormat === 'xml') {
        // Namespace-agnostic lookup relative to the loop item
        const segs = relField.split('.').map((s) => s.includes(':') ? s.split(':').pop() : s)
        const list = segs.map((s) => `'${s}'`).join(', ')
        return `(_findByLocal(${loopVar}, [${list}])?.text() ?: '')`
      }
      return `${loopVar}.${relField}`
    }
    return buildGroovyAccessor(sp, sourceFormat)
  }

  const isJsonTarget = targetFormat === 'json'

  function renderGroovyTree(tree, indent, currentPath, loopContext) {
    for (const [key, val] of Object.entries(tree)) {
      const nodePath = currentPath ? `${currentPath}.${key}` : key

      if (val.__leaf) {
        if (loopContext && val.__mapping) {
          // Inside a loop — use inline accessor relative to loop variable
          const expr = groovyInlineAccessor(val.__mapping, loopContext.loopVar, loopContext.srcArrayPath)
          lines.push(
            isJsonTarget
              ? `${indent}"${key}" ${expr}`
              : `${indent}'${key}'(${expr})`
          )
        } else {
          lines.push(
            isJsonTarget
              ? `${indent}"${key}" ${val.varName}`
              : `${indent}${key}(${val.varName})`
          )
        }
      } else {
        const children = val.__children || val
        const isArray = groovyArrayPaths.has(nodePath)

        if (isArray && sourceFormat === 'xml') {
          const srcArrayPath = inferSourceArrayPath(nodePath, mappings)
          if (srcArrayPath) {
            const srcLocalName = srcArrayPath.split('.').pop()
            const localName = srcLocalName.includes(':') ? srcLocalName.split(':').pop() : srcLocalName
            const loopVar = 'item'
            // Namespace-agnostic deep findAll: strip any xmlns prefix before comparing
            lines.push(`${indent}src.'**'.findAll { it?.name()?.toString()?.replaceAll(/^[^:]+:/, '') == '${localName}' }.each { ${loopVar} ->`)
            lines.push(`${indent}    '${key}' {`)
            renderGroovyTree(children, indent + '        ', nodePath, { loopVar, srcArrayPath })
            lines.push(`${indent}    }`)
            lines.push(`${indent}}`)
          } else {
            lines.push(`${indent}${key} {`)
            renderGroovyTree(children, indent + '    ', nodePath, loopContext)
            lines.push(`${indent}}`)
          }
        } else {
          lines.push(`${indent}${key} {`)
          renderGroovyTree(children, indent + '    ', nodePath, loopContext)
          lines.push(`${indent}}`)
        }
      }
    }
  }

  if (targetFormat === 'json') {
    lines.push('    def output = new JsonBuilder()')
    lines.push('    output {')
    if (groovyTargetRoot) {
      lines.push(`        ${groovyTargetRoot} {`)
      renderGroovyTree(targetTree, '            ', '', null)
      lines.push('        }')
    } else {
      renderGroovyTree(targetTree, '        ', '', null)
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

    if (isTargetSoap) {
      lines.push("    xml.'soapenv:Envelope'('xmlns:soapenv': 'http://schemas.xmlsoap.org/soap/envelope/') {")
      lines.push("        'soapenv:Header'()")
      lines.push("        'soapenv:Body' {")
      if (groovyTargetRoot) {
        lines.push(`            ${groovyTargetRoot} {`)
        renderGroovyTree(targetTree, '                ', '', null)
        lines.push('            }')
      } else {
        renderGroovyTree(targetTree, '            ', '', null)
      }
      lines.push('        }')
      lines.push('    }')
    } else {
      if (groovyTargetRoot) {
        lines.push(`    xml.${groovyTargetRoot} {`)
        renderGroovyTree(targetTree, '        ', '', null)
        lines.push('    }')
      } else {
        lines.push('    xml {')
        renderGroovyTree(targetTree, '        ', '', null)
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
