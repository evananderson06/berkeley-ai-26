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
// read-only. The view follows wherever the change is happening — the end of the
// file while appending, or a mid-file line when an [EDIT]/[DELETE] patches it.
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
        // Auto-follow the "typing" as it streams in, but only while the viewer is
        // parked at the bottom. The moment they scroll up to read earlier code we
        // stop yanking the viewport back, so manual scrolling actually sticks; once
        // they scroll back down, following resumes.
        let following = true

        const isAtBottom = () => {
          const remaining =
            editor.getScrollHeight() - editor.getScrollTop() - editor.getLayoutInfo().height
          // A couple of lines of slack so we count "close enough" as at-bottom.
          return remaining <= 40
        }

        editor.onDidScrollChange(() => {
          following = isAtBottom()
        })

        // Follow the "typing" — scroll to wherever the edit landed (mid-file for an
        // in-place patch, end of file for an append) — unless the viewer scrolled away.
        editor.onDidChangeModelContent((e) => {
          if (!following) return
          const model = editor.getModel()
          if (!model) return
          const line = e.changes.length
            ? e.changes[e.changes.length - 1].range.startLineNumber
            : model.getLineCount()
          editor.revealLineInCenterIfOutsideViewport(line)
        })
      }}
    />
  )
}
