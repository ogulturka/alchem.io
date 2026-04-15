import { useCallback } from 'react'
import Editor from '@monaco-editor/react'
import useAppStore from '../../store/useAppStore'

// Disable Monaco's JS/TS semantic + syntax validation so Groovy (which we
// highlight with the javascript grammar) doesn't show noisy red squigglies.
function handleEditorBeforeMount(monaco) {
  try {
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
      noSuggestionDiagnostics: true,
    })
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
      noSuggestionDiagnostics: true,
    })
  } catch {
    // ignore — depends on monaco version
  }
}

export default function CodeEditor({ value, onChange, language = 'json', readOnly = false }) {
  const monacoTheme = useAppStore((s) => s.getMonacoTheme())

  const beforeMount = useCallback((monaco) => handleEditorBeforeMount(monaco), [])

  return (
    <Editor
      value={value}
      onChange={onChange}
      language={language}
      theme={monacoTheme}
      beforeMount={beforeMount}
      options={{
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "'Consolas', 'Courier New', monospace",
        fontLigatures: false,
        letterSpacing: 0,
        lineHeight: 20,
        scrollBeyondLastLine: false,
        padding: { top: 16, bottom: 16 },
        readOnly,
        lineNumbers: readOnly ? 'off' : 'on',
        renderLineHighlight: readOnly ? 'none' : 'line',
        scrollbar: {
          verticalScrollbarSize: 6,
          horizontalScrollbarSize: 6,
        },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
        wordWrap: 'on',
      }}
    />
  )
}
