import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FileCode, FileJson, RefreshCw, AlertCircle, ArrowRightLeft, Mail, PanelLeftClose, Code, LayoutGrid, ChevronDown } from 'lucide-react'
import CodeEditor from '../editors/CodeEditor'
import SchemaBuilderTree from '../editors/SchemaBuilderTree'
import useAppStore from '../../store/useAppStore'
import { parsePayloadToSchema, generatePayloadFromSchema } from '../../utils/schemaGenerator'

const TOOLBAR_HEIGHT = 26

function ToolbarDivider() {
  return <div className="self-center w-px h-3.5" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
}

function FormatDropdown({ value, onChange }) {
  return (
    <div className="relative flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-[10px] font-bold uppercase tracking-wider rounded-md cursor-pointer outline-none transition-colors"
        style={{
          height: TOOLBAR_HEIGHT,
          padding: '0 18px 0 8px',
          backgroundColor: 'transparent',
          border: 'none',
          color: 'var(--color-accent)',
          appearance: 'none',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)' }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        <option value="xml" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>XML</option>
        <option value="json" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>JSON</option>
      </select>
      <ChevronDown
        size={10}
        className="absolute right-1.5 pointer-events-none"
        style={{ color: 'var(--color-accent)', opacity: 0.7 }}
      />
    </div>
  )
}

function SoapToggleButton({ active, onClick, label }) {
  return (
    <motion.button
      onClick={onClick}
      title={label}
      className="flex items-center gap-1 rounded-md text-[10px] font-bold uppercase tracking-wider cursor-pointer border-none"
      style={{
        height: TOOLBAR_HEIGHT,
        padding: '0 8px',
        backgroundColor: active ? 'rgba(168,85,247,0.15)' : 'transparent',
        color: active ? '#c4b5fd' : 'var(--color-text-secondary)',
        border: active ? '1px solid rgba(168,85,247,0.3)' : '1px solid transparent',
        transition: 'all 0.15s',
      }}
      whileTap={{ scale: 0.96 }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      <Mail size={10} style={{ opacity: active ? 1 : 0.55 }} />
      SOAP
    </motion.button>
  )
}

function SyncButton({ onClick, error }) {
  const [spinning, setSpinning] = useState(false)
  const handle = () => {
    onClick()
    if (!error) {
      setSpinning(true)
      setTimeout(() => setSpinning(false), 600)
    }
  }
  return (
    <motion.button
      onClick={handle}
      title={error || 'Parse & sync to canvas'}
      className="flex items-center gap-1.5 rounded-md text-[10px] font-semibold cursor-pointer border-none"
      style={{
        height: TOOLBAR_HEIGHT,
        padding: '0 8px',
        backgroundColor: error ? 'rgba(239,68,68,0.12)' : 'transparent',
        color: error ? '#f87171' : 'var(--color-text-secondary)',
        border: error ? '1px solid rgba(239,68,68,0.25)' : '1px solid transparent',
        transition: 'all 0.15s',
      }}
      whileTap={{ scale: 0.96 }}
      onMouseEnter={(e) => {
        if (!error) {
          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'
          e.currentTarget.style.color = 'var(--color-text-primary)'
        }
      }}
      onMouseLeave={(e) => {
        if (!error) {
          e.currentTarget.style.backgroundColor = 'transparent'
          e.currentTarget.style.color = 'var(--color-text-secondary)'
        }
      }}
    >
      {error ? (
        <AlertCircle size={10} />
      ) : (
        <motion.div animate={spinning ? { rotate: 360 } : { rotate: 0 }} transition={{ duration: 0.5, ease: 'easeInOut' }}>
          <RefreshCw size={10} />
        </motion.div>
      )}
      Sync
    </motion.button>
  )
}

function ConversionToast({ error }) {
  return (
    <AnimatePresence>
      {error && (
        <motion.div
          className="flex items-center gap-1.5 px-2.5 py-1 mx-3 mb-1 rounded text-[10px]"
          style={{ backgroundColor: '#ef444420', color: '#ef4444', border: '1px solid #ef444440' }}
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: 'auto', marginBottom: 4 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.2 }}
        >
          <AlertCircle size={10} className="flex-shrink-0" />
          <span className="truncate">Conversion failed — content unchanged</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ViewToggle({ view, onChange, layoutId }) {
  const tabs = [
    { id: 'code', label: 'Code', icon: Code },
    { id: 'design', label: 'Design', icon: LayoutGrid },
  ]
  return (
    <div
      className="flex items-center rounded-md p-0.5"
      style={{
        height: TOOLBAR_HEIGHT,
        backgroundColor: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {tabs.map((t) => {
        const Icon = t.icon
        const isActive = view === t.id
        return (
          <motion.button
            key={t.id}
            onClick={() => onChange(t.id)}
            className="relative flex items-center gap-1 rounded cursor-pointer border-none h-full"
            style={{
              padding: '0 7px',
              backgroundColor: 'transparent',
              color: isActive ? '#c4b5fd' : 'var(--color-text-secondary)',
              transition: 'color 0.15s',
            }}
            whileTap={{ scale: 0.96 }}
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                className="absolute inset-0 rounded"
                style={{
                  background: 'linear-gradient(135deg, rgba(168,85,247,0.22), rgba(168,85,247,0.1))',
                  border: '1px solid rgba(168,85,247,0.35)',
                  boxShadow: '0 0 8px rgba(168,85,247,0.2)',
                }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              />
            )}
            <Icon size={10} className="relative z-10" strokeWidth={2.4} />
            <span className="relative z-10 text-[10px] font-semibold">{t.label}</span>
          </motion.button>
        )
      })}
    </div>
  )
}

function PanelHeader({ icon: Icon, label, onCollapse, collapseIcon: CollapseIcon, children }) {
  return (
    <div
      className="flex items-center justify-between w-full px-3 py-2 shrink-0"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(0,0,0,0.15)',
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {onCollapse && CollapseIcon && (
          <button
            onClick={onCollapse}
            className="flex items-center justify-center rounded-md cursor-pointer border-none transition-colors flex-shrink-0"
            style={{ width: 22, height: 22, backgroundColor: 'transparent', color: 'var(--color-text-secondary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent)'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <CollapseIcon size={13} />
          </button>
        )}
        <div
          className="flex items-center justify-center rounded-md flex-shrink-0"
          style={{
            width: 22,
            height: 22,
            background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(168,85,247,0.04))',
            border: '1px solid rgba(168,85,247,0.2)',
          }}
        >
          <Icon size={11} style={{ color: '#a78bfa' }} strokeWidth={2.4} />
        </div>
        <span className="text-[11px] uppercase tracking-wider font-bold" style={{ color: 'var(--color-text-primary)' }}>
          {label}
        </span>
      </div>
      <div
        className="flex items-center gap-1 rounded-lg p-0.5 flex-shrink-0"
        style={{
          backgroundColor: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

function SoapEnvelopeHint({ position }) {
  const isTop = position === 'top'
  const lines = isTop
    ? ['<soapenv:Envelope xmlns:soapenv="...soap/envelope/">', '  <soapenv:Body>']
    : ['  </soapenv:Body>', '</soapenv:Envelope>']

  return (
    <div
      className="flex-none px-4 font-mono text-[10px] leading-[16px] select-none pointer-events-none"
      style={{
        color: 'rgba(139,92,246,0.4)',
        backgroundColor: 'rgba(139,92,246,0.04)',
        borderTop: isTop ? 'none' : '1px dashed rgba(139,92,246,0.2)',
        borderBottom: isTop ? '1px dashed rgba(139,92,246,0.2)' : 'none',
        padding: '3px 16px',
      }}
    >
      {lines.map((l, i) => (
        <div key={i} style={{ whiteSpace: 'pre' }}>{l}</div>
      ))}
    </div>
  )
}

export default function LeftPanel({ onCollapse }) {
  const requestCode = useAppStore((s) => s.requestCode)
  const responseStructure = useAppStore((s) => s.responseStructure)
  const setRequestCode = useAppStore((s) => s.setRequestCode)
  const setResponseStructure = useAppStore((s) => s.setResponseStructure)
  const sourceFormat = useAppStore((s) => s.sourceFormat)
  const targetFormat = useAppStore((s) => s.targetFormat)
  const setSourceFormat = useAppStore((s) => s.setSourceFormat)
  const setTargetFormat = useAppStore((s) => s.setTargetFormat)
  const syncSourceTree = useAppStore((s) => s.syncSourceTree)
  const syncTargetTree = useAppStore((s) => s.syncTargetTree)
  const parseError = useAppStore((s) => s.parseError)
  const conversionError = useAppStore((s) => s.conversionError)
  const isSourceSoap = useAppStore((s) => s.isSourceSoap)
  const isTargetSoap = useAppStore((s) => s.isTargetSoap)
  const setSourceSoap = useAppStore((s) => s.setSourceSoap)
  const setTargetSoap = useAppStore((s) => s.setTargetSoap)

  const [sourceView, setSourceView] = useState('code') // 'code' | 'design'
  const [targetView, setTargetView] = useState('code')
  const [sourceSchema, setSourceSchema] = useState([])
  const [targetSchema, setTargetSchema] = useState([])

  // Switching to Design view → auto-import the current payload into the schema builder
  const handleSourceViewChange = (newView) => {
    if (newView === 'design' && requestCode && requestCode.trim()) {
      const { schema } = parsePayloadToSchema(requestCode, sourceFormat)
      if (schema.length > 0) setSourceSchema(schema)
    }
    setSourceView(newView)
  }

  const handleTargetViewChange = (newView) => {
    if (newView === 'design' && responseStructure && responseStructure.trim()) {
      const { schema } = parsePayloadToSchema(responseStructure, targetFormat)
      if (schema.length > 0) setTargetSchema(schema)
    }
    setTargetView(newView)
  }

  const handleSourceGenerate = (payload) => {
    setRequestCode(payload)
    setSourceView('code')
    setTimeout(() => syncSourceTree(), 50)
  }

  const handleTargetGenerate = (payload) => {
    setResponseStructure(payload)
    setTargetView('code')
    setTimeout(() => syncTargetTree(), 50)
  }

  // Auto-sync: any schema edit (add/delete/rename/type-change) → regenerate code + canvas
  const handleSourceSchemaChange = (newSchema) => {
    setSourceSchema(newSchema)
    const payload = generatePayloadFromSchema(newSchema, sourceFormat)
    setRequestCode(payload)
    setTimeout(() => syncSourceTree(), 0)
  }

  const handleTargetSchemaChange = (newSchema) => {
    setTargetSchema(newSchema)
    const payload = generatePayloadFromSchema(newSchema, targetFormat)
    setResponseStructure(payload)
    setTimeout(() => syncTargetTree(), 0)
  }

  const showSourceEnvelope = isSourceSoap && sourceFormat === 'xml' && sourceView === 'code'
  const showTargetEnvelope = isTargetSoap && targetFormat === 'xml' && targetView === 'code'

  return (
    <div
      className="h-full flex flex-col bg-bg-secondary"
    >
      {/* Source Editor */}
      <div className="flex-1 min-h-0 flex flex-col">
        <PanelHeader icon={FileCode} label="Source" onCollapse={onCollapse} collapseIcon={onCollapse ? PanelLeftClose : null}>
          <ViewToggle view={sourceView} onChange={handleSourceViewChange} layoutId="source-view-toggle" />
          <ToolbarDivider />
          <SoapToggleButton
            active={isSourceSoap}
            onClick={() => setSourceSoap(!isSourceSoap)}
            label="Strip SOAP Envelope from source payload"
          />
          <ToolbarDivider />
          <FormatDropdown value={sourceFormat} onChange={setSourceFormat} />
          <ToolbarDivider />
          <SyncButton onClick={syncSourceTree} error={parseError.source} />
        </PanelHeader>
        <ConversionToast error={conversionError.source} />
        {showSourceEnvelope && <SoapEnvelopeHint position="top" />}
        <div className="flex-1 min-h-0 relative overflow-hidden">
          {sourceView === 'code' ? (
            <CodeEditor
              value={requestCode}
              onChange={setRequestCode}
              language={sourceFormat === 'xml' ? 'xml' : 'json'}
            />
          ) : (
            <SchemaBuilderTree
              schema={sourceSchema}
              onSchemaChange={handleSourceSchemaChange}
              format={sourceFormat}
              onGenerate={handleSourceGenerate}
            />
          )}
        </div>
        {showSourceEnvelope && <SoapEnvelopeHint position="bottom" />}
      </div>

      {/* Target Editor */}
      <div className="flex-1 min-h-0 flex flex-col border-t border-border">
        <PanelHeader icon={FileJson} label="Target">
          <ViewToggle view={targetView} onChange={handleTargetViewChange} layoutId="target-view-toggle" />
          <ToolbarDivider />
          <SoapToggleButton
            active={isTargetSoap}
            onClick={() => setTargetSoap(!isTargetSoap)}
            label="Wrap output in SOAP Envelope"
          />
          <ToolbarDivider />
          <FormatDropdown value={targetFormat} onChange={setTargetFormat} />
          <ToolbarDivider />
          <SyncButton onClick={syncTargetTree} error={parseError.target} />
        </PanelHeader>
        <ConversionToast error={conversionError.target} />
        {showTargetEnvelope && <SoapEnvelopeHint position="top" />}
        <div className="flex-1 min-h-0 relative overflow-hidden">
          {targetView === 'code' ? (
            <CodeEditor
              value={responseStructure}
              onChange={setResponseStructure}
              language={targetFormat === 'xml' ? 'xml' : 'json'}
            />
          ) : (
            <SchemaBuilderTree
              schema={targetSchema}
              onSchemaChange={handleTargetSchemaChange}
              format={targetFormat}
              onGenerate={handleTargetGenerate}
            />
          )}
        </div>
        {showTargetEnvelope && <SoapEnvelopeHint position="bottom" />}
      </div>
    </div>
  )
}
