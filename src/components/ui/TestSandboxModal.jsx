import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Play, FlaskConical, FileInput, FileOutput, FileCode, AlertTriangle } from 'lucide-react'
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

  // Sync input payload when the modal opens or source changes
  useEffect(() => {
    if (open) {
      setInputPayload(requestCode)
      setXsltScript(generatedCode.xslt || '')
      setGroovyScript(generatedCode.groovy || '')
      setOutputResult('')
      setIsError(false)
    }
  }, [open, requestCode, generatedCode.xslt, generatedCode.groovy])

  const handleExecute = useCallback(() => {
    setIsExecuting(true)
    setOutputResult('')
    setIsError(false)

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
