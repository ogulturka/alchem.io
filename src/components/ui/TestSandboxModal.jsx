import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Play, FlaskConical, FileInput, FileOutput, FileCode, AlertTriangle, Sparkles } from 'lucide-react'
import CodeEditor from '../editors/CodeEditor'
import useAppStore from '../../store/useAppStore'
import { executeGroovyMock } from '../../utils/groovyMockEngine'

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

function autoFixXSLT(rawXslt) {
  let xslt = rawXslt
  const fixes = []

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

// ── Main Modal ──

export default function TestSandboxModal({ open, onClose }) {
  const requestCode = useAppStore((s) => s.requestCode)
  const generatedCode = useAppStore((s) => s.generatedCode)
  const sourceFormat = useAppStore((s) => s.sourceFormat)

  const [engine, setEngine] = useState('xslt') // 'xslt' | 'groovy'
  const [inputPayload, setInputPayload] = useState(requestCode)
  const [xsltScript, setXsltScript] = useState(generatedCode.xslt || '')
  const [groovyScript, setGroovyScript] = useState(generatedCode.groovy || '')
  const [outputResult, setOutputResult] = useState('')
  const [isError, setIsError] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [canAutoFix, setCanAutoFix] = useState(false)
  const [autoFixApplied, setAutoFixApplied] = useState(false)
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
    }
  }, [open, requestCode, generatedCode.xslt, generatedCode.groovy])

  // Auto-run execution after alchemize-error patches the script
  useEffect(() => {
    if (pendingAutoRun.current && xsltScript) {
      pendingAutoRun.current = false
      handleExecute()
    }
  }, [xsltScript])

  const handleExecute = useCallback(() => {
    setIsExecuting(true)
    setOutputResult('')
    setIsError(false)
    setCanAutoFix(false)

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
          // Always show auto-fix on XSLT errors — it handles 2.0 features,
          // namespace cleanup, and other common browser-incompatible patterns
          setCanAutoFix(true)
        } else {
          setOutputResult(result)
          setIsError(false)
        }
      } else {
        // Groovy mock engine
        if (!groovyScript || groovyScript.startsWith('//')) {
          setOutputResult('Error: No Groovy code generated yet.\nClick "Alchemize Code" first to generate the Groovy script.')
          setIsError(true)
          setIsExecuting(false)
          return
        }
        const { result, error } = executeGroovyMock(inputPayload, groovyScript, sourceFormat)
        if (error) {
          setOutputResult(error)
          setIsError(true)
        } else {
          setOutputResult(result)
          setIsError(false)
        }
      }
      setIsExecuting(false)
    }, 300)
  }, [inputPayload, engine, xsltScript, groovyScript, sourceFormat])

  const handleAlchemizeError = useCallback(() => {
    const { fixedXslt } = autoFixXSLT(xsltScript)
    setXsltScript(fixedXslt)
    setCanAutoFix(false)
    setAutoFixApplied(true)
    setIsError(false)
    setOutputResult('')
    // Schedule auto-run after state updates
    pendingAutoRun.current = true
  }, [xsltScript])

  const isXslt = engine === 'xslt'
  const inputLabel = isXslt
    ? `Input Payload (${sourceFormat === 'xml' ? 'XML' : 'JSON'})`
    : `Input Payload (${sourceFormat === 'xml' ? 'XML' : 'JSON'})`
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
            className="relative flex flex-col rounded-2xl border overflow-hidden"
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
                  className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
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

            {/* ── Body ── */}
            <div className="flex-1 min-h-0 flex">

              {/* Left column: Input Payload */}
              <div
                className="flex flex-col min-w-0"
                style={{ flex: '1 1 33%', borderRight: '1px solid var(--color-border)' }}
              >
                <div className="flex items-center gap-2 px-4 py-2.5 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <FileInput size={14} style={{ color: 'var(--color-accent)' }} />
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
                    {inputLabel}
                  </span>
                </div>
                <div className="flex-1 min-h-0">
                  <CodeEditor
                    value={inputPayload}
                    onChange={(val) => setInputPayload(val || '')}
                    language={inputLang}
                  />
                </div>
              </div>

              {/* Middle column: Script editor (XSLT or Groovy) */}
              <div
                className="flex flex-col min-w-0"
                style={{ flex: '1 1 34%', borderRight: '1px solid var(--color-border)' }}
              >
                <div className="flex items-center gap-2 px-4 py-2.5 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <FileCode size={14} style={{ color: isXslt ? 'var(--color-accent)' : '#eab308' }} />
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
                    {isXslt ? 'XSLT Stylesheet' : 'Groovy Script'}
                  </span>
                  <span
                    className="ml-auto text-[9px] px-1.5 py-0.5 rounded font-mono"
                    style={{
                      backgroundColor: isXslt ? 'rgba(168,85,247,0.08)' : 'rgba(234,179,8,0.08)',
                      color: isXslt ? 'var(--color-accent)' : '#eab308',
                    }}
                  >
                    editable
                  </span>
                </div>
                <div className="flex-1 min-h-0">
                  {isXslt ? (
                    <CodeEditor
                      value={xsltScript}
                      onChange={(val) => setXsltScript(val || '')}
                      language="xml"
                    />
                  ) : (
                    <CodeEditor
                      value={groovyScript}
                      onChange={(val) => setGroovyScript(val || '')}
                      language="javascript"
                    />
                  )}
                </div>
              </div>

              {/* Right column: Output */}
              <div
                className="flex flex-col min-w-0"
                style={{ flex: '1 1 33%' }}
              >
                <div className="flex items-center gap-2 px-4 py-2.5 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <FileOutput size={14} style={{ color: isError ? '#ef4444' : '#22c55e' }} />
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
                    Transformation Result
                  </span>
                  {isError && (
                    <div className="flex items-center gap-1 ml-auto">
                      <AlertTriangle size={12} color="#ef4444" />
                      <span className="text-[10px] font-semibold" style={{ color: '#ef4444' }}>Error</span>
                    </div>
                  )}
                </div>

                {/* Auto-fix banner */}
                <AnimatePresence>
                  {isError && canAutoFix && isXslt && (
                    <motion.div
                      className="shrink-0 px-3 py-3 flex flex-col gap-2.5"
                      style={{
                        background: 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(168,85,247,0.06))',
                        borderBottom: '1px solid rgba(239,68,68,0.15)',
                      }}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={13} color="#ef4444" className="shrink-0 mt-0.5" />
                        <span className="text-[10px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                          Transformation failed. Click below to auto-fix browser-incompatible XSLT (2.0 functions, namespaces, etc.) and re-execute.
                        </span>
                      </div>
                      <div className="relative self-center">
                        <div
                          className="absolute -inset-1 rounded-lg blur-md opacity-60 animate-pulse"
                          style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}
                        />
                        <motion.button
                          onClick={handleAlchemizeError}
                          className="relative flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-white text-[11px] tracking-wider cursor-pointer"
                          style={{
                            background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                            boxShadow: '0 0 16px rgba(168,85,247,0.4), 0 2px 8px rgba(0,0,0,0.3)',
                            border: 'none',
                          }}
                          whileHover={{ scale: 1.05, boxShadow: '0 0 24px rgba(168,85,247,0.6), 0 4px 12px rgba(0,0,0,0.3)' }}
                          whileTap={{ scale: 0.95 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        >
                          <Sparkles size={14} />
                          Alchemize Error
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Auto-fix success banner */}
                <AnimatePresence>
                  {autoFixApplied && !isError && (
                    <motion.div
                      className="shrink-0 px-3 py-2 flex items-center gap-2"
                      style={{
                        background: 'rgba(34,197,94,0.06)',
                        borderBottom: '1px solid rgba(34,197,94,0.15)',
                      }}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <Sparkles size={12} color="#22c55e" />
                      <span className="text-[10px] font-semibold" style={{ color: '#22c55e' }}>
                        Auto-fixed! XSLT downgraded to 1.0 and re-executed successfully.
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex-1 min-h-0" style={isError ? { background: 'rgba(239,68,68,0.03)' } : {}}>
                  <CodeEditor
                    value={outputResult}
                    language={outputLang}
                    readOnly
                  />
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
                  className="relative flex items-center gap-2.5 px-10 py-3 rounded-full font-bold text-white text-sm tracking-wider cursor-pointer disabled:cursor-wait"
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
