import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Play, FlaskConical, FileInput, FileOutput, FileCode, FileCheck2, AlertTriangle, Sparkles, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import CodeEditor from '../editors/CodeEditor'
import useAppStore from '../../store/useAppStore'
import { executeGroovyMock } from '../../utils/groovyMockEngine'
import { validateAgainstTargetSchema, buildTypeMapFromTree } from '../../utils/schemaValidator'
import { alchemizeMismatches } from '../../utils/alchemizeMismatches'
import { generateXSLT, generateGroovy } from '../../utils/codeGenerator'

// ── XML Formatter ──

function formatXml(xmlString) {
  const PADDING = '  '
  let formatted = ''
  let indent = 0
  const lines = xmlString.replace(/(>)\s*(<)/g, '$1\n$2').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('</')) indent--
    formatted += PADDING.repeat(Math.max(indent, 0)) + trimmed + '\n'
    if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.startsWith('<?') && !trimmed.endsWith('/>') && !/<\/[^>]+>$/.test(trimmed)) {
      indent++
    }
  }
  return formatted.trim()
}

// ── XSLT Engine ──

function executeXsltTransform(inputXml, xsltString) {
  const parser = new DOMParser()

  const xmlDoc = parser.parseFromString(inputXml, 'application/xml')
  const xmlError = xmlDoc.querySelector('parsererror')
  if (xmlError) {
    return { error: `XML Parse Error:\n${xmlError.textContent}` }
  }

  const xslDoc = parser.parseFromString(xsltString, 'application/xml')
  const xslError = xslDoc.querySelector('parsererror')
  if (xslError) {
    return { error: `XSLT Parse Error:\n${xslError.textContent}` }
  }

  try {
    const processor = new XSLTProcessor()
    processor.importStylesheet(xslDoc)
    const resultDoc = processor.transformToDocument(xmlDoc)

    if (!resultDoc) {
      return { error: 'Transformation Error:\nXSLTProcessor returned null. The XSLT stylesheet may contain unsupported functions or syntax.' }
    }

    const errorNode = resultDoc.querySelector('parsererror')
    if (errorNode) {
      return { error: `Transformation Error:\n${errorNode.textContent}` }
    }

    const serializer = new XMLSerializer()
    const raw = serializer.serializeToString(resultDoc)

    if (!raw || raw.trim() === '' || raw.trim() === '<?xml version="1.0" encoding="UTF-8"?>') {
      return { error: 'Transformation produced empty output.\nCheck that your source XML structure matches the expected field paths.' }
    }

    return { result: formatXml(raw) }
  } catch (err) {
    return { error: `Execution Error:\n${err.message}` }
  }
}

// ── XSLT Auto-Fix (2.0 → 1.0 Downgrade) ──

const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function autoFixXSLT(rawXslt, errorMessage = '') {
  let xslt = rawXslt
  const fixes = []
  const errLower = errorMessage.toLowerCase()

  // 0. Structural fix: "Extra content at the end" / "multiple root" — wrap template body in <Root>
  if (errLower.includes('extra content') || errLower.includes('multiple root') || errLower.includes('junk after document')) {
    const templateMatch = xslt.match(
      /(<xsl:template\s+match="[^"]*">)([\s\S]*?)(<\/xsl:template>)/
    )
    if (templateMatch) {
      const body = templateMatch[2]
      // Check if body has multiple top-level elements
      const topElements = body.match(/<(?!xsl:|\/)[A-Za-z][\w.-]*/g)
      const closingElements = body.match(/<\/(?!xsl:)[A-Za-z][\w.-]*/g)
      if (topElements && closingElements && topElements.length > 1) {
        const wrappedBody = `\n      <Root>${body}      </Root>\n    `
        xslt = xslt.replace(templateMatch[2], wrappedBody)
        fixes.push('Wrapped multiple root elements inside <Root> tag')
      }
    }
  }

  // 1. Version downgrade
  if (/version\s*=\s*"2\.0"/.test(xslt)) {
    xslt = xslt.replace(/version\s*=\s*"2\.0"/, 'version="1.0"')
    fixes.push('Downgraded version="2.0" to version="1.0"')
  }

  // 2. Remove XPath 2.0 namespace declarations
  if (/xmlns:fn\s*=\s*"[^"]*"/.test(xslt)) {
    xslt = xslt.replace(/\s*xmlns:fn\s*=\s*"[^"]*"/g, '')
    fixes.push('Removed xmlns:fn namespace')
  }
  if (/xmlns:xs\s*=\s*"[^"]*"/.test(xslt)) {
    xslt = xslt.replace(/\s*xmlns:xs\s*=\s*"[^"]*"/g, '')
    fixes.push('Removed xmlns:xs namespace')
  }

  // 3. fn:upper-case(...) → translate(..., 'abc...', 'ABC...')
  const upperRegex = /fn:upper-case\(([^)]+)\)/g
  if (upperRegex.test(xslt)) {
    xslt = xslt.replace(/fn:upper-case\(([^)]+)\)/g,
      `translate($1, '${LOWER}', '${UPPER}')`)
    fixes.push('Replaced fn:upper-case() with translate()')
  }

  // 4. fn:lower-case(...) → translate(..., 'ABC...', 'abc...')
  const lowerRegex = /fn:lower-case\(([^)]+)\)/g
  if (lowerRegex.test(xslt)) {
    xslt = xslt.replace(/fn:lower-case\(([^)]+)\)/g,
      `translate($1, '${UPPER}', '${LOWER}')`)
    fixes.push('Replaced fn:lower-case() with translate()')
  }

  // 5. format-dateTime(xs:dateTime(...), 'picture') → substring-based fallback
  //    Matches: format-dateTime(xs:dateTime(EXPR), 'PICTURE')
  xslt = xslt.replace(
    /format-dateTime\(xs:dateTime\(([^)]+)\)\s*,\s*'([^']*)'\)/g,
    (_, srcExpr, picture) => {
      fixes.push(`Replaced format-dateTime() with substring fallback`)
      return dateTimePictureFallback(srcExpr, picture)
    }
  )

  // 6. format-date(xs:date(...), 'picture') → same fallback
  xslt = xslt.replace(
    /format-date\(xs:date\(([^)]+)\)\s*,\s*'([^']*)'\)/g,
    (_, srcExpr, picture) => {
      fixes.push(`Replaced format-date() with substring fallback`)
      return dateTimePictureFallback(srcExpr, picture)
    }
  )

  // 7. replace(expr, 'search', 'replace') → can't inline in 1.0, use translate for single-char or passthrough
  xslt = xslt.replace(
    /replace\(([^,]+),\s*'([^']*)'\s*,\s*'([^']*)'\)/g,
    (_, srcExpr, search, replacement) => {
      if (search.length === 1 && replacement.length <= 1) {
        fixes.push('Replaced replace() with translate() for single-char substitution')
        return `translate(${srcExpr}, '${search}', '${replacement}')`
      }
      // Multi-char replace can't be done inline in 1.0 — just pass the source through
      fixes.push('Removed unsupported replace() — use a named template for multi-char replace')
      return srcExpr.trim()
    }
  )

  // 8. XPath 2.0 "if (cond) then X else Y" → fallback to first value
  xslt = xslt.replace(
    /if\s*\(([^)]+)\)\s+then\s+(.+?)\s+else\s+(.+?)(?="|<)/g,
    (_, _cond, trueExpr) => {
      fixes.push('Removed XPath 2.0 if/then/else — using true-branch value')
      return trueExpr.trim()
    }
  )

  // 9. Ensure output method is "xml" (text method can cause null result in browsers)
  if (/method\s*=\s*"text"/.test(xslt)) {
    xslt = xslt.replace(/method\s*=\s*"text"/, 'method="xml"')
    fixes.push('Changed output method="text" to method="xml"')
  }

  // 10. Remove exclude-result-prefixes (can cause issues in some browsers)
  if (/exclude-result-prefixes\s*=\s*"[^"]*"/.test(xslt)) {
    xslt = xslt.replace(/\s*exclude-result-prefixes\s*=\s*"[^"]*"/g, '')
    fixes.push('Removed exclude-result-prefixes')
  }

  // 11. Ensure version="1.0" exists if no version at all
  if (!(/version\s*=\s*"/.test(xslt)) && /<xsl:stylesheet/.test(xslt)) {
    xslt = xslt.replace(/<xsl:stylesheet/, '<xsl:stylesheet version="1.0"')
    fixes.push('Added missing version="1.0"')
  }

  return { fixedXslt: xslt, fixes }
}

/** Convert XPath 2.0 date picture to XSLT 1.0 substring/concat */
function dateTimePictureFallback(srcExpr, picture) {
  const year = `substring(${srcExpr}, 1, 4)`
  const month = `substring(${srcExpr}, 6, 2)`
  const day = `substring(${srcExpr}, 9, 2)`

  if (picture.includes('[M01]/[D01]/[Y0001]')) {
    return `concat(${month}, '/', ${day}, '/', ${year})`
  }
  if (picture.includes('[D01].[M01].[Y0001]')) {
    return `concat(${day}, '.', ${month}, '.', ${year})`
  }
  if (picture.includes('T[H01]:[m01]:[s01]')) {
    return `concat(substring(${srcExpr}, 1, 10), 'T', substring(${srcExpr}, 12, 8), 'Z')`
  }
  // Default: yyyy-MM-dd passthrough
  return `substring(${srcExpr}, 1, 10)`
}

/** Detect if an XSLT string contains 2.0 features that can be auto-fixed */
function hasXslt2Features(xsltStr) {
  if (!xsltStr) return false
  return /version\s*=\s*"2\.0"/.test(xsltStr) ||
    /fn:upper-case|fn:lower-case/.test(xsltStr) ||
    /format-dateTime|format-date/.test(xsltStr) ||
    /xmlns:fn\s*=/.test(xsltStr) ||
    /xmlns:xs\s*=/.test(xsltStr)
}

// ── Tab Button ──

function EngineTab({ label, isActive, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className="relative px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest cursor-pointer bg-transparent border-none transition-colors"
      style={{ color: isActive ? color : 'var(--color-text-secondary)' }}
    >
      {label}
      {isActive && (
        <motion.div
          layoutId="sandbox-engine-tab"
          className="absolute bottom-0 left-0 right-0 rounded-full"
          style={{ height: 2, backgroundColor: color }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
    </button>
  )
}

// ── Visual Diff Engine ──

function flattenForDiff(obj, prefix = '') {
  const entries = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      entries.push({ path, key, type: 'object', depth: path.split('.').length - 1 })
      entries.push(...flattenForDiff(value, path))
    } else {
      entries.push({ path, key, value: String(value ?? ''), type: typeof value, depth: path.split('.').length - 1 })
    }
  }
  return entries
}

function xmlToObj(xmlStr) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlStr, 'application/xml')
  if (doc.querySelector('parsererror')) return null
  function walk(n) {
    const ch = Array.from(n.children)
    if (!ch.length) { const t = n.textContent || ''; return /^-?\d+(\.\d+)?$/.test(t.trim()) && t.trim() ? Number(t) : t }
    const o = {}; for (const c of ch) o[c.tagName] = walk(c); return o
  }
  return walk(doc.documentElement)
}

function buildDiffLines(resultString, targetString, targetFormat) {
  let resultObj, targetObj
  try {
    const rt = (resultString || '').trim()
    if (rt.startsWith('{')) resultObj = JSON.parse(rt)
    else if (rt.startsWith('<')) resultObj = xmlToObj(rt)
  } catch { resultObj = null }
  try {
    if (targetFormat === 'json') targetObj = JSON.parse(targetString)
    else targetObj = xmlToObj(targetString)
  } catch { targetObj = null }

  if (!targetObj) return { targetLines: [], resultLines: [] }

  const targetEntries = flattenForDiff(targetObj)
  const resultFlat = resultObj ? Object.fromEntries(
    flattenForDiff(resultObj).filter((e) => e.type !== 'object').map((e) => [e.path, e.value])
  ) : {}
  const resultPaths = resultObj ? new Set(flattenForDiff(resultObj).map((e) => e.path)) : new Set()

  // Build target lines with diff status
  const targetLines = targetEntries.map((entry) => {
    if (entry.type === 'object') {
      return { text: `${'  '.repeat(entry.depth)}${entry.key}: {`, status: 'neutral', path: entry.path }
    }
    const indent = '  '.repeat(entry.depth)
    const line = `${indent}${entry.key}: ${entry.value}`
    if (!resultPaths.has(entry.path)) {
      return { text: line, status: 'missing', path: entry.path }
    }
    const actualVal = resultFlat[entry.path]
    if (actualVal !== undefined && actualVal !== entry.value) {
      return { text: line, status: 'mismatch', path: entry.path, actual: actualVal }
    }
    return { text: line, status: 'match', path: entry.path }
  })

  return { targetLines }
}

/** Render color-coded diff lines */
function DiffView({ lines }) {
  if (!lines || lines.length === 0) return null

  const statusStyles = {
    match: { bg: 'rgba(34,197,94,0.08)', border: '#22c55e', color: '#86efac' },
    missing: { bg: 'rgba(239,68,68,0.08)', border: '#ef4444', color: '#fca5a5' },
    mismatch: { bg: 'rgba(245,158,11,0.08)', border: '#f59e0b', color: '#fcd34d' },
    neutral: { bg: 'transparent', border: 'transparent', color: 'var(--color-text-secondary)' },
  }

  return (
    <div className="h-full overflow-auto p-3 font-mono text-[11px] leading-relaxed" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
      {lines.map((line, i) => {
        const s = statusStyles[line.status] || statusStyles.neutral
        return (
          <div
            key={i}
            className="flex items-start gap-2 px-2 py-0.5 rounded-sm my-px"
            style={{
              backgroundColor: s.bg,
              borderLeft: `3px solid ${s.border}`,
              color: s.color,
            }}
          >
            <span className="shrink-0 w-3 text-center text-[8px] mt-0.5" style={{ color: s.border }}>
              {line.status === 'match' ? '✓' : line.status === 'missing' ? '✗' : line.status === 'mismatch' ? '~' : ''}
            </span>
            <span className="whitespace-pre">{line.text}</span>
            {line.status === 'mismatch' && line.actual && (
              <span className="ml-auto text-[9px] shrink-0 px-1.5 rounded" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                got: {line.actual}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main Modal ──

export default function TestSandboxModal({ open, onClose }) {
  const requestCode = useAppStore((s) => s.requestCode)
  const generatedCode = useAppStore((s) => s.generatedCode)
  const sourceFormat = useAppStore((s) => s.sourceFormat)
  const targetFormat = useAppStore((s) => s.targetFormat)
  const responseStructure = useAppStore((s) => s.responseStructure)
  const isSourceSoap = useAppStore((s) => s.isSourceSoap)
  const isTargetSoap = useAppStore((s) => s.isTargetSoap)

  const [engine, setEngine] = useState('xslt') // 'xslt' | 'groovy'
  const [inputPayload, setInputPayload] = useState(requestCode)
  const [xsltScript, setXsltScript] = useState(generatedCode.xslt || '')
  const [groovyScript, setGroovyScript] = useState(generatedCode.groovy || '')
  const [outputResult, setOutputResult] = useState('')
  const [isError, setIsError] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [canAutoFix, setCanAutoFix] = useState(false)
  const [autoFixApplied, setAutoFixApplied] = useState(false)
  const [validation, setValidation] = useState(null) // { status, matchPercent, errors }
  const [validationExpanded, setValidationExpanded] = useState(false)
  const pendingAutoRun = useRef(false)

  // Sync input payload when the modal opens or source changes
  useEffect(() => {
    if (open) {
      setInputPayload(requestCode)
      setXsltScript(generatedCode.xslt || '')
      setGroovyScript(generatedCode.groovy || '')
      setOutputResult('')
      setIsError(false)
      setCanAutoFix(false)
      setAutoFixApplied(false)
      setValidation(null)
      setValidationExpanded(false)
    }
  }, [open, requestCode, generatedCode.xslt, generatedCode.groovy])

  // Auto-run execution after alchemize-error patches the script
  useEffect(() => {
    if (pendingAutoRun.current && xsltScript) {
      pendingAutoRun.current = false
      handleExecute()
    }
  }, [xsltScript])

  const runValidation = useCallback((resultStr) => {
    if (responseStructure) {
      // Read user-defined type overrides from the target payload tree
      const targetNode = useAppStore.getState().nodes.find((n) => n.id === 'target-payload')
      const typeOverrides = targetNode?.data?.tree ? buildTypeMapFromTree(targetNode.data.tree) : null
      const v = validateAgainstTargetSchema(resultStr, responseStructure, targetFormat, typeOverrides)
      setValidation(v)
      setValidationExpanded(false)
    }
  }, [responseStructure, targetFormat])

  const handleExecute = useCallback(() => {
    setIsExecuting(true)
    setOutputResult('')
    setIsError(false)
    setCanAutoFix(false)
    setValidation(null)

    setTimeout(() => {
      if (engine === 'xslt') {
        if (!xsltScript || xsltScript.startsWith('<!--')) {
          setOutputResult('Error: No XSLT code generated yet.\nClick "Alchemize Code" first to generate the XSLT stylesheet.')
          setIsError(true)
          setIsExecuting(false)
          return
        }
        const { result, error } = executeXsltTransform(inputPayload, xsltScript)
        if (error) {
          setOutputResult(error)
          setIsError(true)
          setCanAutoFix(true)
        } else {
          setOutputResult(result)
          setIsError(false)
          runValidation(result)
        }
      } else {
        if (!groovyScript || groovyScript.startsWith('//')) {
          setOutputResult('Error: No Groovy code generated yet.\nClick "Alchemize Code" first to generate the Groovy script.')
          setIsError(true)
          setIsExecuting(false)
          return
        }
        const { result, error } = executeGroovyMock(inputPayload, groovyScript, sourceFormat, { isSourceSoap, isTargetSoap })
        if (error) {
          setOutputResult(error)
          setIsError(true)
        } else {
          setOutputResult(result)
          setIsError(false)
          runValidation(result)
        }
      }
      setIsExecuting(false)
    }, 300)
  }, [inputPayload, engine, xsltScript, groovyScript, sourceFormat, runValidation])

  const handleAlchemizeError = useCallback(() => {
    const { fixedXslt } = autoFixXSLT(xsltScript, outputResult)
    setXsltScript(fixedXslt)
    setCanAutoFix(false)
    setAutoFixApplied(true)
    setIsError(false)
    setOutputResult('')
    // Schedule auto-run after state updates
    pendingAutoRun.current = true
  }, [xsltScript, outputResult])

  const handleAlchemizeMismatches = useCallback(() => {
    if (!validation || validation.errors.length === 0) return

    const storeState = useAppStore.getState()
    const sourcePayload = storeState.nodes.find((n) => n.id === 'source-payload')

    const { newNodes, newEdges, fixes, removeEdgeIds } = alchemizeMismatches({
      errors: validation.errors,
      targetPayload: responseStructure,
      targetFormat,
      resultString: outputResult,
      sourceTree: sourcePayload?.data?.tree || [],
      nodes: storeState.nodes,
      edges: storeState.edges,
    })

    if (newNodes.length === 0 && newEdges.length === 0) {
      setValidation((v) => ({ ...v, _fixNote: 'No auto-fixable mismatches found.' }))
      return
    }

    // Apply to store: add new nodes/edges, remove replaced edges
    const updatedEdges = storeState.edges
      .filter((e) => !removeEdgeIds.includes(e.id))
      .concat(newEdges.map((e) => { const { _removeEdgeIds, ...rest } = e; return rest }))

    const updatedNodes = [...storeState.nodes, ...newNodes]

    useAppStore.setState({ nodes: updatedNodes, edges: updatedEdges })

    // Regenerate code with new graph
    const { sourceFormat: sf, targetFormat: tf, groovyPlatform: gp, isSourceSoap: sSoap, isTargetSoap: tSoap, requestCode: srcXml } = storeState
    const soapFlags = { isSourceSoap: sSoap, isTargetSoap: tSoap }
    const xslt = generateXSLT(updatedNodes, updatedEdges, sf, tf, soapFlags, srcXml)
    const groovy = generateGroovy(updatedNodes, updatedEdges, sf, tf, gp, soapFlags)
    useAppStore.setState({ generatedCode: { xslt, groovy } })

    // Update sandbox editors
    setXsltScript(xslt)
    setGroovyScript(groovy)

    // Clear validation and auto-rerun
    setValidation(null)
    setOutputResult('')
    setAutoFixApplied(false)
    pendingAutoRun.current = true
  }, [validation, responseStructure, targetFormat, outputResult])

  // Compute diff lines when result and target are both available
  const diffLines = useMemo(() => {
    if (!outputResult || isError || !responseStructure) return []
    const { targetLines } = buildDiffLines(outputResult, responseStructure, targetFormat)
    return targetLines
  }, [outputResult, isError, responseStructure, targetFormat])

  const isXslt = engine === 'xslt'
  const inputLabel = `Input Payload (${sourceFormat === 'xml' ? 'XML' : 'JSON'})`
  const inputLang = sourceFormat === 'xml' ? 'xml' : 'json'
  const outputLang = isError ? 'plaintext' : (isXslt ? 'xml' : 'json')

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative flex flex-col rounded-xl border overflow-hidden"
            style={{
              width: 'min(95vw, 1400px)',
              height: 'min(88vh, 800px)',
              backgroundColor: 'var(--color-bg-primary)',
              borderColor: 'var(--color-border)',
              boxShadow: '0 0 60px rgba(0,0,0,0.5), 0 0 30px var(--color-accent-glow)',
            }}
            initial={{ scale: 0.92, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 30 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          >
            {/* ── Header ── */}
            <div
              className="flex items-center gap-3 px-6 py-3 shrink-0"
              style={{
                borderBottom: '1px solid var(--color-border)',
                background: 'linear-gradient(135deg, var(--color-bg-secondary), var(--color-bg-tertiary))',
              }}
            >
              <div
                className="flex items-center justify-center w-8 h-8 rounded-lg"
                style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-glow))' }}
              >
                <FlaskConical size={16} color="white" strokeWidth={2.5} />
              </div>
              <span
                className="text-sm font-bold uppercase tracking-widest"
                style={{ color: 'var(--color-text-primary)' }}
              >
                Test Execution Sandbox
              </span>

              {/* Engine Tabs */}
              <div
                className="flex ml-4"
                style={{ borderBottom: '1px solid var(--color-border)' }}
              >
                <EngineTab
                  label="XSLT Engine"
                  isActive={isXslt}
                  onClick={() => { setEngine('xslt'); setOutputResult(''); setIsError(false) }}
                  color="var(--color-accent)"
                />
                <EngineTab
                  label="Groovy Engine"
                  isActive={!isXslt}
                  onClick={() => { setEngine('groovy'); setOutputResult(''); setIsError(false) }}
                  color="#eab308"
                />
              </div>

              {/* Mock badge for Groovy */}
              {!isXslt && (
                <span
                  className="text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider"
                  style={{ backgroundColor: 'rgba(234,179,8,0.12)', color: '#eab308' }}
                >
                  JS Mock
                </span>
              )}

              <button
                onClick={onClose}
                className="ml-auto flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-colors"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  color: 'var(--color-text-secondary)',
                  border: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)'
                  e.currentTarget.style.color = '#ef4444'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Body: 2x2 Grid ── */}
            <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2" style={{ gridTemplateRows: '1fr 1fr' }}>

              {/* ── Top-Left: Input Payload ── */}
              <div className="flex flex-col min-h-0" style={{ borderRight: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <FileInput size={13} style={{ color: 'var(--color-accent)' }} />
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>{inputLabel}</span>
                </div>
                <div className="flex-1 min-h-0">
                  <CodeEditor value={inputPayload} onChange={(val) => setInputPayload(val || '')} language={inputLang} />
                </div>
              </div>

              {/* ── Top-Right: Script Editor ── */}
              <div className="flex flex-col min-h-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <FileCode size={13} style={{ color: isXslt ? 'var(--color-accent)' : '#eab308' }} />
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
                    {isXslt ? 'XSLT Stylesheet' : 'Groovy Script'}
                  </span>
                  <span className="ml-auto text-[8px] px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: isXslt ? 'rgba(168,85,247,0.08)' : 'rgba(234,179,8,0.08)', color: isXslt ? 'var(--color-accent)' : '#eab308' }}>editable</span>
                </div>
                <div className="flex-1 min-h-0">
                  {isXslt
                    ? <CodeEditor value={xsltScript} onChange={(val) => setXsltScript(val || '')} language="xml" />
                    : <CodeEditor value={groovyScript} onChange={(val) => setGroovyScript(val || '')} language="javascript" />
                  }
                </div>
              </div>

              {/* ── Bottom-Left: Transformation Result ── */}
              <div className="flex flex-col min-h-0" style={{ borderRight: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <FileOutput size={13} style={{ color: isError ? '#ef4444' : '#22c55e' }} />
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>Transformation Result</span>
                  {isError && (
                    <div className="flex items-center gap-1 ml-auto">
                      <AlertTriangle size={11} color="#ef4444" />
                      <span className="text-[9px] font-semibold" style={{ color: '#ef4444' }}>Error</span>
                    </div>
                  )}
                  {validation && !isError && (
                    <span className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded-md" style={{
                      backgroundColor: validation.status === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                      color: validation.status === 'success' ? '#22c55e' : '#f59e0b',
                    }}>
                      {validation.matchPercent}%
                    </span>
                  )}
                </div>

                {/* Auto-fix banner (XSLT error) */}
                <AnimatePresence>
                  {isError && canAutoFix && isXslt && (
                    <motion.div className="shrink-0 px-3 py-2 flex items-center gap-2" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(168,85,247,0.06))', borderBottom: '1px solid rgba(239,68,68,0.15)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <AlertTriangle size={12} color="#ef4444" />
                      <span className="text-[9px]" style={{ color: 'var(--color-text-secondary)' }}>Browser-incompatible XSLT detected</span>
                      <motion.button onClick={handleAlchemizeError} className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-white text-[9px] tracking-wider cursor-pointer" style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', border: 'none', boxShadow: '0 0 8px rgba(168,85,247,0.3)' }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                        <Sparkles size={11} /> Auto-Fix
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {autoFixApplied && !isError && (
                    <motion.div className="shrink-0 px-3 py-1.5 flex items-center gap-2" style={{ background: 'rgba(34,197,94,0.06)', borderBottom: '1px solid rgba(34,197,94,0.15)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Sparkles size={11} color="#22c55e" />
                      <span className="text-[9px] font-semibold" style={{ color: '#22c55e' }}>Auto-fixed and re-executed</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex-1 min-h-0" style={isError ? { background: 'rgba(239,68,68,0.03)' } : {}}>
                  <CodeEditor value={outputResult} language={outputLang} readOnly />
                </div>
              </div>

              {/* ── Bottom-Right: Expected Target + Visual Diff ── */}
              <div className="flex flex-col min-h-0">
                <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <FileCheck2 size={13} style={{ color: '#60a5fa' }} />
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>Expected Target (Diff)</span>
                  {/* Legend */}
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="flex items-center gap-1 text-[8px]"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#22c55e' }} /> Match</span>
                    <span className="flex items-center gap-1 text-[8px]"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#ef4444' }} /> Missing</span>
                    <span className="flex items-center gap-1 text-[8px]"><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} /> Mismatch</span>
                  </div>
                </div>

                {/* Validation summary + Alchemize button */}
                {validation && !isError && validation.errors.length > 0 && (
                  <div className="shrink-0 px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(245,158,11,0.04)', borderBottom: '1px solid rgba(245,158,11,0.1)' }}>
                    <AlertTriangle size={12} color="#f59e0b" />
                    <span className="text-[9px] font-semibold" style={{ color: '#f59e0b' }}>
                      {validation.errors.length} mismatch{validation.errors.length !== 1 ? 'es' : ''}
                    </span>
                    <div className="relative ml-auto">
                      <div className="absolute -inset-0.5 rounded-lg blur-sm opacity-50 animate-pulse" style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }} />
                      <motion.button
                        onClick={handleAlchemizeMismatches}
                        className="relative flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-white text-[9px] tracking-wider cursor-pointer"
                        style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', border: 'none', boxShadow: '0 0 8px rgba(245,158,11,0.3)' }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Sparkles size={11} /> Alchemize Mismatches
                      </motion.button>
                    </div>
                  </div>
                )}
                {validation && !isError && validation.errors.length === 0 && (
                  <div className="shrink-0 px-3 py-1.5 flex items-center gap-2" style={{ background: 'rgba(34,197,94,0.06)', borderBottom: '1px solid rgba(34,197,94,0.1)' }}>
                    <CheckCircle2 size={12} color="#22c55e" />
                    <span className="text-[9px] font-bold" style={{ color: '#22c55e' }}>Target Schema Validated — 100% Match</span>
                  </div>
                )}

                {/* Diff view or static target */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  {diffLines.length > 0 ? (
                    <DiffView lines={diffLines} />
                  ) : (
                    <CodeEditor value={responseStructure} language={targetFormat === 'json' ? 'json' : 'xml'} readOnly />
                  )}
                </div>
              </div>
            </div>

            {/* ── Footer ── */}
            <div
              className="flex items-center justify-center px-6 py-3.5 shrink-0"
              style={{
                borderTop: '1px solid var(--color-border)',
                background: 'linear-gradient(135deg, var(--color-bg-secondary), var(--color-bg-tertiary))',
              }}
            >
              <div className="relative">
                <div
                  className="absolute -inset-1 rounded-full blur-md opacity-50 animate-pulse"
                  style={{ backgroundColor: isXslt ? 'var(--color-accent-glow)' : '#eab30880' }}
                />
                <motion.button
                  onClick={handleExecute}
                  disabled={isExecuting}
                  className="relative flex items-center gap-2.5 px-10 py-3 rounded-lg font-bold text-white text-sm tracking-wider cursor-pointer disabled:cursor-wait"
                  style={{
                    background: isXslt
                      ? 'linear-gradient(135deg, var(--color-accent), var(--color-accent-glow))'
                      : 'linear-gradient(135deg, #a16207, #eab308)',
                    boxShadow: isXslt
                      ? '0 0 20px var(--color-accent-glow), 0 4px 12px rgba(0,0,0,0.3)'
                      : '0 0 20px #eab30860, 0 4px 12px rgba(0,0,0,0.3)',
                    border: 'none',
                  }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <AnimatePresence mode="wait">
                    {isExecuting ? (
                      <motion.span
                        key="exec"
                        className="flex items-center gap-2.5"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                      >
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Executing...
                      </motion.span>
                    ) : (
                      <motion.span
                        key="idle"
                        className="flex items-center gap-2.5"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                      >
                        <Play size={16} fill="white" />
                        Execute Mapping
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
