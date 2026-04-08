import { AnimatePresence, motion } from 'framer-motion'
import { FileCode, FileJson, RefreshCw, AlertCircle, ArrowRightLeft } from 'lucide-react'
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

export default function LeftPanel() {
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

  return (
    <div
      className="h-full flex flex-col bg-bg-secondary"
    >
      {/* Source Editor */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <FileCode size={15} className="text-accent" />
          <span className="text-[13px] uppercase tracking-wider font-semibold text-text-secondary">
            Source
          </span>
          <div className="ml-auto flex items-center gap-2">
            <FormatDropdown value={sourceFormat} onChange={setSourceFormat} />
            <SyncButton onClick={syncSourceTree} error={parseError.source} />
          </div>
        </div>
        <ConversionToast error={conversionError.source} />
        <div className="flex-1 min-h-0">
          <CodeEditor
            value={requestCode}
            onChange={setRequestCode}
            language={sourceFormat === 'xml' ? 'xml' : 'json'}
          />
        </div>
      </div>

      {/* Target Editor */}
      <div className="flex-1 min-h-0 flex flex-col border-t border-border">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <FileJson size={15} className="text-accent" />
          <span className="text-[13px] uppercase tracking-wider font-semibold text-text-secondary">
            Target
          </span>
          <div className="ml-auto flex items-center gap-2">
            <FormatDropdown value={targetFormat} onChange={setTargetFormat} />
            <SyncButton onClick={syncTargetTree} error={parseError.target} />
          </div>
        </div>
        <ConversionToast error={conversionError.target} />
        <div className="flex-1 min-h-0">
          <CodeEditor
            value={responseStructure}
            onChange={setResponseStructure}
            language={targetFormat === 'xml' ? 'xml' : 'json'}
          />
        </div>
      </div>
    </div>
  )
}
