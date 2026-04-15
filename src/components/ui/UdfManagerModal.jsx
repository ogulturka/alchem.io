import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Trash2, Braces, Save, Code2, ArrowLeft, Sparkles } from 'lucide-react'
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
  const [language, setLanguage] = useState('groovy')
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

  const canSave = name.trim() && parsedArgs.length > 0

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundColor: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(16px)',
            }}
            onClick={onClose}
          />

          {/* Modal Card */}
          <motion.div
            className="relative flex flex-col rounded-lg overflow-hidden max-h-[88vh]"
            style={{
              width: 'min(92vw, 680px)',
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 80px rgba(168,85,247,0.12), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
            initial={{ scale: 0.94, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            {/* Subtle top accent gradient */}
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.6), transparent)',
              }}
            />

            {/* ── Header ── */}
            <div
              className="flex items-center gap-3 px-6 py-4 shrink-0"
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {editMode && (
                <button
                  onClick={resetForm}
                  className="flex items-center justify-center rounded-lg cursor-pointer border-none transition-colors"
                  style={{
                    width: 28,
                    height: 28,
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    color: 'var(--color-text-secondary)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                  title="Back"
                >
                  <ArrowLeft size={14} />
                </button>
              )}

              <div
                className="flex items-center justify-center rounded-xl"
                style={{
                  width: 36,
                  height: 36,
                  background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.06))',
                  border: '1px solid rgba(168,85,247,0.25)',
                  boxShadow: '0 0 16px rgba(168,85,247,0.15)',
                }}
              >
                <Braces size={16} style={{ color: '#a78bfa' }} strokeWidth={2.2} />
              </div>

              <div className="flex flex-col">
                <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
                  {editMode ? 'Create Function' : 'UDF Library'}
                </h2>
                <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                  {editMode
                    ? 'Define a custom transformation'
                    : `${udfs.length} ${udfs.length === 1 ? 'function' : 'functions'} available`}
                </span>
              </div>

              <button
                onClick={onClose}
                className="ml-auto flex items-center justify-center rounded-lg cursor-pointer transition-all border-none"
                style={{
                  width: 30,
                  height: 30,
                  backgroundColor: 'transparent',
                  color: 'var(--color-text-secondary)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* ── Body ── */}
            <div className="overflow-y-auto">
              {!editMode ? (
                /* ── List View ── */
                <div className="p-5 flex flex-col gap-3">
                  <motion.button
                    onClick={() => setEditMode(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-[12.5px] cursor-pointer border-none"
                    style={{
                      background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                      color: 'white',
                      boxShadow: '0 6px 20px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
                    }}
                    whileHover={{ scale: 1.01, boxShadow: '0 8px 28px rgba(168,85,247,0.5), inset 0 1px 0 rgba(255,255,255,0.2)' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Plus size={15} strokeWidth={2.5} /> Create New Function
                  </motion.button>

                  {udfs.length === 0 ? (
                    <div
                      className="flex flex-col items-center justify-center py-12 px-6 rounded-xl"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.02)',
                        border: '1px dashed rgba(255,255,255,0.08)',
                      }}
                    >
                      <div
                        className="flex items-center justify-center rounded-full mb-3"
                        style={{
                          width: 48,
                          height: 48,
                          backgroundColor: 'rgba(168,85,247,0.06)',
                          border: '1px solid rgba(168,85,247,0.15)',
                        }}
                      >
                        <Sparkles size={20} style={{ color: '#a78bfa', opacity: 0.7 }} />
                      </div>
                      <div className="text-[13px] font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
                        No custom functions yet
                      </div>
                      <div className="text-[11px] text-center max-w-xs" style={{ color: 'var(--color-text-secondary)' }}>
                        Create reusable transformations and use them anywhere in your mappings.
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {udfs.map((udf) => (
                        <motion.div
                          key={udf.id}
                          layout
                          className="group flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                          style={{
                            backgroundColor: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.05)',
                          }}
                          whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                        >
                          <div
                            className="flex items-center justify-center rounded-lg shrink-0"
                            style={{
                              width: 32,
                              height: 32,
                              background: udf.language === 'xslt'
                                ? 'linear-gradient(135deg, rgba(6,182,212,0.2), rgba(6,182,212,0.05))'
                                : 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.05))',
                              border: udf.language === 'xslt'
                                ? '1px solid rgba(6,182,212,0.25)'
                                : '1px solid rgba(34,197,94,0.25)',
                            }}
                          >
                            <Code2 size={14} style={{ color: udf.language === 'xslt' ? '#06b6d4' : '#22c55e' }} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[13px] font-semibold font-mono" style={{ color: 'var(--color-text-primary)' }}>
                                {udf.name}
                              </span>
                              <span
                                className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                                style={{
                                  backgroundColor: udf.language === 'xslt' ? 'rgba(6,182,212,0.12)' : 'rgba(34,197,94,0.12)',
                                  color: udf.language === 'xslt' ? '#06b6d4' : '#22c55e',
                                }}
                              >
                                {udf.language || 'groovy'}
                              </span>
                              <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                                · {udf.code.split('\n').length} lines
                              </span>
                            </div>
                            <div className="flex gap-1 flex-wrap">
                              {udf.args.map((a) => (
                                <span
                                  key={a}
                                  className="text-[9.5px] font-mono px-1.5 py-0.5 rounded"
                                  style={{
                                    backgroundColor: 'rgba(168,85,247,0.08)',
                                    color: '#c4b5fd',
                                    border: '1px solid rgba(168,85,247,0.15)',
                                  }}
                                >
                                  {a}
                                </span>
                              ))}
                            </div>
                          </div>

                          <button
                            onClick={() => removeUdf(udf.id)}
                            className="flex items-center justify-center rounded-lg cursor-pointer shrink-0 transition-all border-none opacity-0 group-hover:opacity-100"
                            style={{
                              width: 30,
                              height: 30,
                              backgroundColor: 'transparent',
                              color: 'var(--color-text-secondary)',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = '#ef4444' }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* ── Create View ── */
                <div className="p-5 flex flex-col gap-5">
                  {/* Row 1: Name + Language */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[10.5px] font-medium block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                        Function name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="myTransform"
                        className="w-full px-3.5 py-2.5 rounded-lg text-[13px] font-mono outline-none transition-all"
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: 'var(--color-text-primary)',
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = 'rgba(168,85,247,0.5)'
                          e.target.style.backgroundColor = 'rgba(168,85,247,0.04)'
                          e.target.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = 'rgba(255,255,255,0.08)'
                          e.target.style.backgroundColor = 'rgba(255,255,255,0.03)'
                          e.target.style.boxShadow = 'none'
                        }}
                      />
                    </div>
                    <div style={{ width: 160 }}>
                      <label className="text-[10.5px] font-medium block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                        Language
                      </label>
                      <div
                        className="flex items-center rounded-lg p-0.5"
                        style={{
                          backgroundColor: 'rgba(0,0,0,0.25)',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        {['groovy', 'xslt'].map((lang) => {
                          const isActive = language === lang
                          const accentColor = lang === 'groovy' ? '#22c55e' : '#06b6d4'
                          const accentBg = lang === 'groovy' ? 'rgba(34,197,94,0.15)' : 'rgba(6,182,212,0.15)'
                          return (
                            <motion.button
                              key={lang}
                              onClick={() => handleLangChange(lang)}
                              className="relative flex-1 py-1.5 text-[11px] font-semibold cursor-pointer border-none rounded-md"
                              style={{
                                backgroundColor: 'transparent',
                                color: isActive ? accentColor : 'var(--color-text-secondary)',
                                transition: 'color 0.15s',
                              }}
                              whileTap={{ scale: 0.97 }}
                            >
                              {isActive && (
                                <motion.div
                                  layoutId="lang-indicator"
                                  className="absolute inset-0 rounded-md"
                                  style={{
                                    backgroundColor: accentBg,
                                    border: `1px solid ${accentColor}40`,
                                  }}
                                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                                />
                              )}
                              <span className="relative z-10">{lang}</span>
                            </motion.button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Arguments */}
                  <div>
                    <label className="text-[10.5px] font-medium block mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                      Arguments <span style={{ opacity: 0.6 }}>· comma-separated</span>
                    </label>
                    <input
                      type="text"
                      value={argsStr}
                      onChange={(e) => setArgsStr(e.target.value)}
                      placeholder="arg1, arg2, arg3"
                      className="w-full px-3.5 py-2.5 rounded-lg text-[13px] font-mono outline-none transition-all"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'var(--color-text-primary)',
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = 'rgba(168,85,247,0.5)'
                        e.target.style.backgroundColor = 'rgba(168,85,247,0.04)'
                        e.target.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = 'rgba(255,255,255,0.08)'
                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)'
                        e.target.style.boxShadow = 'none'
                      }}
                    />
                    {parsedArgs.length > 0 && (
                      <div className="flex gap-1.5 mt-2.5 flex-wrap items-center">
                        {parsedArgs.map((a, i) => (
                          <motion.span
                            key={a}
                            className="text-[10.5px] font-mono px-2.5 py-1 rounded-md"
                            style={{
                              backgroundColor: 'rgba(168,85,247,0.1)',
                              color: '#c4b5fd',
                              border: '1px solid rgba(168,85,247,0.2)',
                            }}
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.04 }}
                          >
                            {a}
                          </motion.span>
                        ))}
                        <span className="text-[10px] ml-1" style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                          → {parsedArgs.length} input{parsedArgs.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Row 3: Code Editor */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <label className="text-[10.5px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        Function body
                      </label>
                    </div>
                    <div
                      className="rounded-lg overflow-hidden relative"
                      style={{
                        height: 220,
                        border: '1px solid rgba(255,255,255,0.08)',
                        backgroundColor: 'rgba(0,0,0,0.2)',
                      }}
                    >
                      <CodeEditor
                        value={code}
                        onChange={(v) => setCode(v || '')}
                        language={language === 'xslt' ? 'xml' : 'javascript'}
                      />
                    </div>
                  </div>

                  {/* Row 4: Actions */}
                  <div className="flex gap-2.5">
                    <button
                      onClick={resetForm}
                      className="flex-1 py-2.5 rounded-lg text-[12px] font-semibold cursor-pointer transition-all border-none"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        color: 'var(--color-text-secondary)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
                    >
                      Cancel
                    </button>
                    <motion.button
                      onClick={handleSave}
                      disabled={!canSave}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12px] font-semibold text-white cursor-pointer disabled:cursor-not-allowed border-none"
                      style={{
                        background: canSave
                          ? 'linear-gradient(135deg, #a855f7, #7c3aed)'
                          : 'rgba(168,85,247,0.15)',
                        color: canSave ? 'white' : 'rgba(255,255,255,0.3)',
                        boxShadow: canSave ? '0 4px 16px rgba(168,85,247,0.35)' : 'none',
                        transition: 'all 0.2s',
                      }}
                      whileHover={canSave ? { scale: 1.01 } : {}}
                      whileTap={canSave ? { scale: 0.98 } : {}}
                    >
                      <Save size={13} /> Save Function
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
