import { AnimatePresence, motion } from 'framer-motion'
import { FileCode, FileJson, RefreshCw, AlertCircle, ArrowRightLeft, Mail, PanelLeftClose } from 'lucide-react'
import CodeEditor from '../editors/CodeEditor'
import useAppStore from '../../store/useAppStore'

function FormatDropdown({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border cursor-pointer outline-none"
      style={{
        backgroundColor: 'var(--color-bg-tertiary)',
        borderColor: 'var(--color-border)',
        color: 'var(--color-accent)',
      }}
    >
      <option value="xml">XML</option>
      <option value="json">JSON</option>
    </select>
  )
}

function SoapToggleButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all"
      style={{
        backgroundColor: active ? 'rgba(139,92,246,0.12)' : 'var(--color-bg-tertiary)',
        borderColor: active ? 'rgba(139,92,246,0.5)' : 'var(--color-border)',
        color: active ? '#a78bfa' : 'var(--color-text-secondary)',
        boxShadow: active ? '0 0 8px rgba(139,92,246,0.2)' : 'none',
      }}
    >
      <Mail size={10} style={{ opacity: active ? 1 : 0.5 }} />
      SOAP
    </button>
  )
}

function SyncButton({ onClick, error }) {
  return (
    <button
      onClick={onClick}
      title={error || 'Parse & sync to canvas'}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-medium cursor-pointer transition-colors"
      style={{
        backgroundColor: error ? '#ef444420' : 'var(--color-bg-tertiary)',
        borderColor: error ? '#ef4444' : 'var(--color-border)',
        color: error ? '#ef4444' : 'var(--color-text-secondary)',
      }}
    >
      {error ? <AlertCircle size={10} /> : <RefreshCw size={10} />}
      Sync
    </button>
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

function SoapEnvelopeHint({ position }) {
  const isTop = position === 'top'
  const lines = isTop
    ? ['<soapenv:Envelope xmlns:soapenv="...soap/envelope/">', '  <soapenv:Body>']
    : ['  </soapenv:Body>', '</soapenv:Envelope>']

  return (
    <div
      className="px-4 font-mono text-[10px] leading-[18px] select-none pointer-events-none"
      style={{
        color: 'rgba(139,92,246,0.35)',
        backgroundColor: 'rgba(139,92,246,0.03)',
        borderTop: isTop ? 'none' : '1px dashed rgba(139,92,246,0.15)',
        borderBottom: isTop ? '1px dashed rgba(139,92,246,0.15)' : 'none',
        paddingTop: isTop ? 4 : 2,
        paddingBottom: isTop ? 2 : 4,
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

  const showSourceEnvelope = isSourceSoap && sourceFormat === 'xml'
  const showTargetEnvelope = isTargetSoap && targetFormat === 'xml'

  return (
    <div
      className="h-full flex flex-col bg-bg-secondary"
    >
      {/* Source Editor */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="flex items-center justify-center rounded-md cursor-pointer border-none transition-colors"
              style={{
                width: 26,
                height: 26,
                backgroundColor: 'transparent',
                color: 'var(--color-text-secondary)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent)'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.backgroundColor = 'transparent' }}
              title="Collapse left panel"
            >
              <PanelLeftClose size={15} />
            </button>
          )}
          <FileCode size={15} className="text-accent" />
          <span className="text-[13px] uppercase tracking-wider font-semibold text-text-secondary">
            Source
          </span>
          <div className="ml-auto flex items-center gap-2">
            <SoapToggleButton
              active={isSourceSoap}
              onClick={() => setSourceSoap(!isSourceSoap)}
              label="Strip SOAP Envelope from source payload"
            />
            <FormatDropdown value={sourceFormat} onChange={setSourceFormat} />
            <SyncButton onClick={syncSourceTree} error={parseError.source} />
          </div>
        </div>
        <ConversionToast error={conversionError.source} />
        {showSourceEnvelope && <SoapEnvelopeHint position="top" />}
        <div className="flex-1 min-h-0">
          <CodeEditor
            value={requestCode}
            onChange={setRequestCode}
            language={sourceFormat === 'xml' ? 'xml' : 'json'}
          />
        </div>
        {showSourceEnvelope && <SoapEnvelopeHint position="bottom" />}
      </div>

      {/* Target Editor */}
      <div className="flex-1 min-h-0 flex flex-col border-t border-border">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <FileJson size={15} className="text-accent" />
          <span className="text-[13px] uppercase tracking-wider font-semibold text-text-secondary">
            Target
          </span>
          <div className="ml-auto flex items-center gap-2">
            <SoapToggleButton
              active={isTargetSoap}
              onClick={() => setTargetSoap(!isTargetSoap)}
              label="Wrap output in SOAP Envelope"
            />
            <FormatDropdown value={targetFormat} onChange={setTargetFormat} />
            <SyncButton onClick={syncTargetTree} error={parseError.target} />
          </div>
        </div>
        <ConversionToast error={conversionError.target} />
        {showTargetEnvelope && <SoapEnvelopeHint position="top" />}
        <div className="flex-1 min-h-0">
          <CodeEditor
            value={responseStructure}
            onChange={setResponseStructure}
            language={targetFormat === 'xml' ? 'xml' : 'json'}
          />
        </div>
        {showTargetEnvelope && <SoapEnvelopeHint position="bottom" />}
      </div>
    </div>
  )
}
