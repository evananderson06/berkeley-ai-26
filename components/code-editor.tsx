'use client'

import dynamic from 'next/dynamic'

// @monaco-editor/react pulls in the Monaco web workers, which can't run during
// SSR — load it client-only.
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-slate-500">
      Loading editor…
    </div>
  ),
})

interface CodeEditorProps {
  value: string
  language: string
}

// The candidate "types" into this; the interviewer only watches, so it's
// read-only. The cursor is kept pinned to the end as code streams in.
export function CodeEditor({ value, language }: CodeEditorProps) {
  return (
    <MonacoEditor
      height="100%"
      language={language}
      theme="vs-dark"
      value={value}
      options={{
        readOnly: true,
        domReadOnly: true,
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        wordWrap: 'on',
        renderLineHighlight: 'none',
        smoothScrolling: true,
        padding: { top: 12, bottom: 12 },
      }}
      onMount={(editor) => {
        // Follow the "typing" as it streams in.
        editor.onDidChangeModelContent(() => {
          const model = editor.getModel()
          if (model) editor.revealLine(model.getLineCount())
        })
      }}
    />
  )
}
