import { NextRequest } from 'next/server'
import { Message, Candidate } from '@/types'
import { anthropic } from '@/lib/anthropic'
import { deriveArchetype, archetypeStyle } from '@/lib/coding/persona'

// Streaming sibling of /api/interview, used when the interviewer asks a coding
// question. The candidate "thinks out loud" and "types" at the same time: the
// model alternates spoken narration ([SPEAK]…[/SPEAK]) with editor ops, and the
// client plays them back so each line of code types out while it's explained
// (line-by-line sync — see lib/coding/parser.ts + lib/voice/useVoiceInterview.ts).
//
// Editor ops (the model edits the file in place instead of rewriting it):
//   [CODE]…[/CODE]                  append brand-new code (first solution / new code)
//   [EDIT]old…[NEW]new…[/EDIT]      replace an existing snippet with a new one
//   [DELETE]old…[/DELETE]           remove an existing snippet
//   [CLEAR]                         wipe the editor (only when starting a fresh problem)
//
// The persona/qualityTier system prompt stays server-side (CONTEXT.md §0.2): the
// browser never sees how good the candidate actually is, or which archetype they
// are. We layer the coding-style instructions on top of the same identity prompt.

interface CodeRequest {
  candidate: Candidate
  messages: Message[]
  newMessage: string
  // The candidate's current editor contents, so a resumed/interrupted answer
  // can continue from the code already on screen.
  code?: string
  language?: string
}

function buildSystemPrompt(candidate: Candidate, language: string): string {
  const style = archetypeStyle(deriveArchetype(candidate))

  return `You are ${candidate.name}, a ${candidate.role} candidate with ${candidate.yearsExperience} years of experience, working through a live coding question in a technical interview. You are thinking out loud while typing code into a shared editor.

BACKGROUND:
${candidate.resume.summary}

YOUR KEY SKILLS: ${candidate.skills.join(', ')}

OUTPUT FORMAT — this is strict and important:
- Wrap everything you SAY OUT LOUD (narration, reasoning, questions, complexity claims) in [SPEAK]...[/SPEAK].
- Never put code inside [SPEAK] (ordinary code comments inside the editor blocks are fine).
- Begin with a [SPEAK] segment.
- Write all code in ${language}.

EXPLAIN LINE BY LINE (important): work in small steps. Before each line or small group of
lines, SAY what you're about to write and why in a short [SPEAK], then immediately write
exactly that code in the matching editor block. The narration and the code are played back in
sync, so keep each [SPEAK] roughly matched to the amount of code that follows it — one thought,
one line. Don't dump a whole function and then explain it; narrate as you build it.

EDITOR OPS — edit the file in place; do NOT retype the whole solution each turn:
- [CODE]...[/CODE]  — append BRAND-NEW code. Use this for your first solution, or genuinely new lines.
- [EDIT]<exact existing snippet>[NEW]<replacement>[/EDIT]  — change code that is already in the editor.
  The snippet between [EDIT] and [NEW] must be copied EXACTLY from the current editor contents
  (it will be located and replaced). Use the smallest unique snippet that covers the change.
- [DELETE]<exact existing snippet>[/DELETE]  — remove code that is already in the editor.
- [CLEAR]  — only when the interviewer moves you to a COMPLETELY different problem; wipes the editor.
- When the interviewer asks you to fix, extend, optimise, or change what you've already written,
  make targeted [EDIT]/[DELETE] ops against the existing code instead of rewriting it from scratch.

YOUR CODING ABILITY ON THIS PROBLEM — this is a HARD CONSTRAINT. The correctness, completeness, and quality of the code you write MUST match this skill level. Do not write a better solution than this describes even if you could, and never reveal that this is a persona:
${style.promptInstructions}

RULES:
- Stay in character as ${candidate.name}; never break character or mention being an AI.
- Keep it realistic for a live interview — concise narration, not an essay.
- If the interviewer interrupts with a new message mid-answer, respond to it naturally and keep going from the code already written.`
}

function buildHistory(messages: Message[]) {
  // Anthropic requires the first message to be from the user; drop a leading
  // assistant greeting the way /api/interview does.
  return messages
    .filter((m, i) => !(m.role === 'assistant' && i === 0))
    .map((m) => ({ role: m.role, content: m.content }))
}

export async function POST(req: NextRequest) {
  let body: CodeRequest
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  if (!body.candidate || typeof body.candidate !== 'object') {
    return new Response('candidate is required', { status: 400 })
  }
  if (!body.newMessage || typeof body.newMessage !== 'string') {
    return new Response('newMessage is required', { status: 400 })
  }

  const language = body.language || 'python'
  const history = buildHistory(Array.isArray(body.messages) ? body.messages : [])

  const userContent = body.code?.trim()
    ? `${body.newMessage}\n\n[The editor currently contains the code below. To change it, use [EDIT]/[DELETE] ops whose snippets are copied EXACTLY from this — do not retype the whole thing:]\n\`\`\`${language}\n${body.code}\n\`\`\``
    : body.newMessage

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

      const llm = anthropic.messages.stream(
        {
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          system: buildSystemPrompt(body.candidate, language),
          messages: [...history, { role: 'user', content: userContent }],
        },
        { signal: req.signal }
      )

      // If the client disconnects (interviewer interrupts → AbortController),
      // tear down the upstream model stream too.
      const onAbort = () => llm.abort()
      req.signal.addEventListener('abort', onAbort)

      try {
        for await (const event of llm) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            send({ t: event.delta.text })
          }
        }
        send({ done: true })
      } catch (err) {
        if (!req.signal.aborted) {
          console.error('[interview/code]', err)
          send({ error: true })
        }
      } finally {
        req.signal.removeEventListener('abort', onAbort)
        try {
          controller.close()
        } catch {
          /* already closed by an abort */
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
