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

  // Find all edges that end at target-payload
  const targetIncoming = edges.filter((e) => e.target === 'target-payload')

  for (const tEdge of targetIncoming) {
    const targetPath = tEdge.targetHandle
    const sourceNodeId = tEdge.source
    const sourceNode = nodeMap.get(sourceNodeId)

    if (!sourceNode) continue

    if (sourceNode.id === 'source-payload') {
      // Direct mapping: source → target (no transform)
      mappings.push({
        targetPath,
        sourcePaths: [tEdge.sourceHandle],
        inputMap: {},
        nodeData: null,
        transforms: [],
      })
    } else if (sourceNode.type === 'transform') {
      // Through transform: find what feeds into this transform
      const transformInputEdges = edges.filter(
        (e) => e.target === sourceNode.id
      )
      const sourcePaths = []
      const inputMap = {}

      for (const inEdge of transformInputEdges) {
        const inNode = nodeMap.get(inEdge.source)
        if (!inNode) continue

        const handleName = inEdge.targetHandle?.replace('in-', '') || 'input'

        if (inNode.id === 'source-payload') {
          sourcePaths.push(inEdge.sourceHandle)
          inputMap[handleName] = inEdge.sourceHandle
        } else if (inNode.type === 'transform') {
          // Chained transforms — trace deeper (1 level)
          const deepEdges = edges.filter((e) => e.target === inNode.id)
          for (const dEdge of deepEdges) {
            if (dEdge.source === 'source-payload') {
              sourcePaths.push(dEdge.sourceHandle)
              inputMap[handleName] = dEdge.sourceHandle
            }
          }
        }
      }

      mappings.push({
        targetPath,
        sourcePaths,
        inputMap,
        nodeData: sourceNode.data,
        transforms: [{ operation: sourceNode.data.operation, nodeId: sourceNode.id }],
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
      return `fn:upper-case(${buildXPathExpr(src, sourceFormat)})`
    }

    case 'formatDate': {
      const src = m.sourcePaths[0]
      return `format-date(xs:date(${buildXPathExpr(src, sourceFormat)}), '[MNn] [D], [Y]')`
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
      const srcPath = m.inputMap['source'] || m.sourcePaths[0]
      const searchPath = m.inputMap['search'] || m.sourcePaths[1]
      const replaceWith = m.nodeData?.replaceWith || ''
      if (!srcPath) return "''"
      const srcExpr = buildXPathExpr(srcPath, sourceFormat)
      if (searchPath) {
        return `replace(${srcExpr}, ${buildXPathExpr(searchPath, sourceFormat)}, '${replaceWith}')`
      }
      return srcExpr
    }

    case 'ifelse': {
      const condPath = m.inputMap['condition'] || m.sourcePaths[0]
      const truePath = m.inputMap['true'] || m.sourcePaths[1]
      const falsePath = m.inputMap['false'] || m.sourcePaths[2]
      const condExpr = condPath ? buildXPathExpr(condPath, sourceFormat) : 'true()'
      const trueExpr = truePath ? buildXPathExpr(truePath, sourceFormat) : "''"
      const falseExpr = falsePath ? buildXPathExpr(falsePath, sourceFormat) : "''"
      return `if (${condExpr}) then ${trueExpr} else ${falseExpr}`
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
      const startPath = m.inputMap['start'] || m.sourcePaths[1]
      const lenPath = m.inputMap['length'] || m.sourcePaths[2]
      const srcExpr = srcPath ? buildXPathExpr(srcPath, sourceFormat) : "''"
      const startExpr = startPath ? `number(${buildXPathExpr(startPath, sourceFormat)})` : '1'
      const lenExpr = lenPath ? `number(${buildXPathExpr(lenPath, sourceFormat)})` : `string-length(${srcExpr})`
      return `substring(${srcExpr}, ${startExpr}, ${lenExpr})`
    }

    case 'equals': {
      const pathA = m.inputMap['valueA'] || m.sourcePaths[0]
      const pathB = m.inputMap['valueB'] || m.sourcePaths[1]
      const exprA = pathA ? buildXPathExpr(pathA, sourceFormat) : "''"
      const exprB = pathB ? buildXPathExpr(pathB, sourceFormat) : "''"
      return `${exprA} = ${exprB}`
    }

    default:
      return buildXPathExpr(m.sourcePaths[0] || '', sourceFormat)
  }
}

// ── XSLT Generator ──

export function generateXSLT(nodes, edges, sourceFormat, targetFormat) {
  const mappings = buildMappings(nodes, edges)

  if (mappings.length === 0) {
    return '<!-- No mappings defined. Connect source fields to target fields on the canvas. -->'
  }

  // Build nested target XML tree from mapping paths
  const targetTree = {}
  for (const m of mappings) {
    const parts = m.targetPath.split('.')
    let current = targetTree
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {}
      current = current[parts[i]]
    }
    current[parts[parts.length - 1]] = m
  }

  function renderTargetElement(tree, indent) {
    const lines = []
    for (const [key, value] of Object.entries(tree)) {
      if (value.targetPath) {
        // Leaf mapping
        const selectExpr = buildXsltSelectExpr(value, sourceFormat)

        // For ifelse, use xsl:choose for cleaner output
        if (value.transforms.length > 0 && value.transforms[0].operation === 'ifelse') {
          const condPath = value.inputMap['condition'] || value.sourcePaths[0]
          const truePath = value.inputMap['true'] || value.sourcePaths[1]
          const falsePath = value.inputMap['false'] || value.sourcePaths[2]
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
        } else {
          lines.push(`${indent}<${key}>`)
          lines.push(`${indent}  <xsl:value-of select="${selectExpr}"/>`)
          lines.push(`${indent}</${key}>`)
        }
      } else {
        // Nested element
        lines.push(`${indent}<${key}>`)
        lines.push(...renderTargetElement(value, indent + '  '))
        lines.push(`${indent}</${key}>`)
      }
    }
    return lines
  }

  const bodyLines = renderTargetElement(targetTree, '      ')

  // Determine root match pattern based on source format
  const matchPattern = sourceFormat === 'xml' ? '/*' : '/'

  // Compute source root element name for documentation
  const sourceFields = mappings.flatMap((m) => m.sourcePaths).filter(Boolean)
  const rootElements = [...new Set(sourceFields.map((p) => p.split('.')[0]))]

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Alchem.io — Auto-generated XSLT 2.0
  Source: ${sourceFormat.toUpperCase()} → Target: ${targetFormat.toUpperCase()}
  Mappings: ${mappings.length} field(s)
  Source root(s): ${rootElements.join(', ') || 'N/A'}
-->
<xsl:stylesheet version="2.0"
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:fn="http://www.w3.org/2005/xpath-functions"
    xmlns:xs="http://www.w3.org/2001/XMLSchema">

  <xsl:output method="${targetFormat === 'xml' ? 'xml' : 'text'}" indent="yes" encoding="UTF-8"/>

  <xsl:template match="${matchPattern}">
${bodyLines.join('\n')}
  </xsl:template>

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
    case 'formatDate':
      return `Date.parse("yyyy-MM-dd", ${accessor}.toString()).format("MMMM dd, yyyy")`
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

export function generateGroovy(nodes, edges, sourceFormat, targetFormat, platform = 'sap-cpi') {
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
    lines.push('    def src = new XmlSlurper().parseText(body)')
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
        const searchPath = m.inputMap?.['search'] || m.sourcePaths[1]
        if (srcPath && searchPath) {
          const accessor = buildGroovyAccessor(srcPath, sourceFormat)
          const searchAccessor = buildGroovyAccessor(searchPath, sourceFormat)
          lines.push(`    def ${varName} = ${accessor}.toString().replace(${searchAccessor}.toString(), "${m.nodeData?.replaceWith || ''}")`)
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
      } else if (op === 'math') {
        const pathA = m.inputMap?.['a'] || m.sourcePaths[0]
        const pathB = m.inputMap?.['b'] || m.sourcePaths[1]
        const mathOp = m.nodeData?.mathOperator || '+'
        const accA = pathA ? `(${buildGroovyAccessor(pathA, sourceFormat)} as BigDecimal)` : '0'
        const accB = pathB ? `(${buildGroovyAccessor(pathB, sourceFormat)} as BigDecimal)` : '0'
        lines.push(`    def ${varName} = ${accA} ${mathOp} ${accB}`)
      } else if (op === 'substring') {
        const srcPath = m.inputMap?.['source'] || m.sourcePaths[0]
        const startPath = m.inputMap?.['start'] || m.sourcePaths[1]
        const lenPath = m.inputMap?.['length'] || m.sourcePaths[2]
        const srcAcc = srcPath ? `${buildGroovyAccessor(srcPath, sourceFormat)}.toString()` : '""'
        const startAcc = startPath ? `(${buildGroovyAccessor(startPath, sourceFormat)} as int)` : '0'
        const lenAcc = lenPath ? `(${buildGroovyAccessor(lenPath, sourceFormat)} as int)` : `${srcAcc}.length()`
        lines.push(`    def ${varName} = ${srcAcc}.substring(${startAcc}, Math.min(${startAcc} + ${lenAcc}, ${srcAcc}.length()))`)
      } else if (op === 'equals') {
        const pathA = m.inputMap?.['valueA'] || m.sourcePaths[0]
        const pathB = m.inputMap?.['valueB'] || m.sourcePaths[1]
        const accA = pathA ? `${buildGroovyAccessor(pathA, sourceFormat)}.toString()` : '""'
        const accB = pathB ? `${buildGroovyAccessor(pathB, sourceFormat)}.toString()` : '""'
        lines.push(`    def ${varName} = ${accA} == ${accB}`)
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

    renderJsonBuilder(targetTree, '        ')
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

    lines.push('    xml {')
    renderMarkupBuilder(targetTree, '        ')
    lines.push('    }')
    lines.push('')
    const setBodyLines = config.setBody(contentType)
    setBodyLines.forEach((l) => lines.push(l.replace('%OUTPUT%', 'writer.toString()')))
  }

  lines.push('')
  if (config.returnStmt) lines.push(config.returnStmt)
  lines.push('}')

  return lines.join('\n')
}
