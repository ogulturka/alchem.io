import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Trash2, Braces, Save, Code2 } from 'lucide-react'
import CodeEditor from '../editors/CodeEditor'
import useAppStore from '../../store/useAppStore'

const GROOVY_DEFAULT = `// Arguments are available as variables
// Return the transformed value
return arg1.toUpperCase()`

const XSLT_DEFAULT = `<!-- Arguments are passed as $arg1, $arg2 etc. -->
<xsl:value-of select="$arg1"/>`

export default function UdfManagerModal({ open, onClose }) {
  const udfs = useAppStore((s) => s.udfs)
  const addUdf = useAppStore((s) => s.addUdf)
  const removeUdf = useAppStore((s) => s.removeUdf)

  const [editMode, setEditMode] = useState(false)
  const [name, setName] = useState('')
  const [argsStr, setArgsStr] = useState('arg1')
  const [language, setLanguage] = useState('groovy') // 'groovy' | 'xslt'
  const [code, setCode] = useState(GROOVY_DEFAULT)

  const parsedArgs = useMemo(
    () => argsStr.split(',').map((a) => a.trim()).filter(Boolean),
    [argsStr]
  )

  const resetForm = useCallback(() => {
    setName('')
    setArgsStr('arg1')
    setLanguage('groovy')
    setCode(GROOVY_DEFAULT)
    setEditMode(false)
  }, [])

  const handleLangChange = useCallback((lang) => {
    setLanguage(lang)
    setCode(lang === 'groovy' ? GROOVY_DEFAULT : XSLT_DEFAULT)
  }, [])

  const handleSave = useCallback(() => {
    if (!name.trim() || parsedArgs.length === 0) return
    addUdf({ name: name.trim(), args: parsedArgs, code, language })
    resetForm()
  }, [name, parsedArgs, code, language, addUdf, resetForm])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={onClose}
          />

          <motion.div
            className="relative flex flex-col rounded-xl border overflow-hidden max-h-[90vh]"
            style={{
              width: 'min(92vw, 640px)',
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
              className="flex items-center gap-3 px-5 py-3.5 shrink-0"
              style={{ borderBottom: '1px solid var(--color-border)', background: 'linear-gradient(135deg, var(--color-bg-secondary), var(--color-bg-tertiary))' }}
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: 'linear-gradient(135deg, var(--color-cat-logic), var(--color-cat-logic-glow))' }}>
                <Braces size={14} color="white" strokeWidth={2.5} />
              </div>
              <span className="text-[13px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-primary)' }}>
                {editMode ? 'Create UDF' : 'UDF Library'}
              </span>
              <span className="text-[9px] px-2 py-0.5 rounded-md font-bold" style={{ backgroundColor: 'rgba(168,85,247,0.12)', color: 'var(--color-accent)' }}>
                {udfs.length} function{udfs.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={onClose}
                className="ml-auto flex items-center justify-center w-7 h-7 rounded-lg cursor-pointer transition-colors"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)', border: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              >
                <X size={15} />
              </button>
            </div>

            {/* ── Body ── */}
            <div className="overflow-y-auto">
              {!editMode ? (
                /* ── List View ── */
                <div className="p-4 flex flex-col gap-2.5">
                  <motion.button
                    onClick={() => setEditMode(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-[12px] tracking-wider cursor-pointer"
                    style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-glow))', border: 'none', color: 'white', boxShadow: '0 0 16px var(--color-accent-glow)' }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Plus size={15} /> Create New UDF
                  </motion.button>

                  {udfs.length === 0 && (
                    <div className="text-center py-8">
                      <Braces size={28} className="mx-auto mb-3" style={{ color: 'var(--color-border)', opacity: 0.5 }} />
                      <div className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                        No UDFs yet. Create a custom function to use in your mappings.
                      </div>
                    </div>
                  )}

                  {udfs.map((udf) => (
                    <div
                      key={udf.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors"
                      style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: 'linear-gradient(135deg, var(--color-cat-logic), var(--color-cat-logic-glow))' }}>
                        <Braces size={14} color="white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-bold" style={{ color: 'var(--color-text-primary)' }}>{udf.name}</span>
                          <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded" style={{
                            backgroundColor: udf.language === 'xslt' ? 'rgba(6,182,212,0.12)' : 'rgba(34,197,94,0.12)',
                            color: udf.language === 'xslt' ? '#06b6d4' : '#22c55e',
                          }}>
                            {udf.language || 'groovy'}
                          </span>
                        </div>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {udf.args.map((a) => (
                            <span key={a} className="text-[8px] font-mono px-1.5 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(168,85,247,0.1)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.2)' }}>{a}</span>
                          ))}
                        </div>
                      </div>
                      <span className="text-[9px] font-mono px-2 py-1 rounded shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--color-text-secondary)' }}>
                        {udf.code.split('\n').length} lines
                      </span>
                      <button
                        onClick={() => removeUdf(udf.id)}
                        className="flex items-center justify-center w-7 h-7 rounded-lg cursor-pointer shrink-0 transition-colors"
                        style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: 'none', color: '#ef4444' }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.2)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                /* ── Create View ── */
                <div className="p-4 flex flex-col gap-4">

                  {/* Row 1: Name + Language */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[9px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Function Name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="myTransform"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[12px] font-mono outline-none transition-colors"
                        style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                        onFocus={(e) => { e.target.style.borderColor = 'var(--color-accent)'; e.target.style.boxShadow = '0 0 8px var(--color-accent-glow)' }}
                        onBlur={(e) => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none' }}
                      />
                    </div>
                    <div style={{ width: 140 }}>
                      <label className="text-[9px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Language</label>
                      <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                        {['groovy', 'xslt'].map((lang) => (
                          <button
                            key={lang}
                            onClick={() => handleLangChange(lang)}
                            className="flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all"
                            style={{
                              border: 'none',
                              backgroundColor: language === lang
                                ? (lang === 'groovy' ? 'rgba(34,197,94,0.15)' : 'rgba(6,182,212,0.15)')
                                : 'var(--color-bg-tertiary)',
                              color: language === lang
                                ? (lang === 'groovy' ? '#22c55e' : '#06b6d4')
                                : 'var(--color-text-secondary)',
                            }}
                          >
                            {lang}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Arguments */}
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                      Arguments
                      <span className="font-normal ml-1 normal-case tracking-normal" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>(comma-separated)</span>
                    </label>
                    <input
                      type="text"
                      value={argsStr}
                      onChange={(e) => setArgsStr(e.target.value)}
                      placeholder="arg1, arg2, arg3"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[12px] font-mono outline-none transition-colors"
                      style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                      onFocus={(e) => { e.target.style.borderColor = 'var(--color-accent)'; e.target.style.boxShadow = '0 0 8px var(--color-accent-glow)' }}
                      onBlur={(e) => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none' }}
                    />
                    {/* Argument pills */}
                    {parsedArgs.length > 0 && (
                      <div className="flex gap-1.5 mt-2.5 flex-wrap">
                        {parsedArgs.map((a, i) => (
                          <motion.span
                            key={a}
                            className="text-[10px] font-mono px-3 py-1 rounded-md"
                            style={{
                              backgroundColor: 'rgba(168,85,247,0.1)',
                              color: '#d8b4fe',
                              border: '1px solid rgba(168,85,247,0.3)',
                              boxShadow: '0 0 6px rgba(168,85,247,0.15)',
                            }}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.05 }}
                          >
                            {a}
                          </motion.span>
                        ))}
                        <span className="text-[9px] self-center ml-1" style={{ color: 'var(--color-text-secondary)', opacity: 0.5 }}>
                          → {parsedArgs.length} input{parsedArgs.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Row 3: Code Editor */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Code2 size={12} style={{ color: language === 'groovy' ? '#22c55e' : '#06b6d4' }} />
                      <label className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
                        Code Body
                      </label>
                      <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded" style={{
                        backgroundColor: language === 'groovy' ? 'rgba(34,197,94,0.12)' : 'rgba(6,182,212,0.12)',
                        color: language === 'groovy' ? '#22c55e' : '#06b6d4',
                      }}>
                        {language}
                      </span>
                    </div>
                    <div
                      className="rounded-lg overflow-hidden"
                      style={{ height: 220, border: '1px solid var(--color-border)' }}
                    >
                      <CodeEditor
                        value={code}
                        onChange={(v) => setCode(v || '')}
                        language={language === 'xslt' ? 'xml' : 'javascript'}
                      />
                    </div>
                  </div>

                  {/* Row 4: Actions */}
                  <div className="flex gap-3">
                    <button
                      onClick={resetForm}
                      className="flex-1 py-2.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors"
                      style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-text-secondary)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
                    >
                      Cancel
                    </button>
                    <motion.button
                      onClick={handleSave}
                      disabled={!name.trim() || parsedArgs.length === 0}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[11px] font-bold text-white cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-glow))', border: 'none', boxShadow: '0 0 12px var(--color-accent-glow)' }}
                      whileHover={name.trim() && parsedArgs.length > 0 ? { scale: 1.02 } : {}}
                      whileTap={name.trim() && parsedArgs.length > 0 ? { scale: 0.98 } : {}}
                    >
                      <Save size={13} /> Save UDF
                    </motion.button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
