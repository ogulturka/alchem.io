import Editor from '@monaco-editor/react'
import useAppStore from '../../store/useAppStore'

export default function CodeEditor({ value, onChange, language = 'json', readOnly = false }) {
  const monacoTheme = useAppStore((s) => s.getMonacoTheme())

  return (
    <Editor
      value={value}
      onChange={onChange}
      language={language}
      theme={monacoTheme}
      options={{
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "'JetBrains Mono', monospace",
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
