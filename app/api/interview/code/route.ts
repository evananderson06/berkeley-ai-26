import { NextRequest } from 'next/server'
import { Message, Candidate } from '@/types'
import { anthropic } from '@/lib/anthropic'
import { deriveArchetype, archetypeStyle } from '@/lib/coding/persona'

// Streaming sibling of /api/interview, used when the interviewer asks a coding
// question. The candidate "thinks out loud" and "types" at the same time: the
// model is told to wrap spoken narration in [SPEAK]…[/SPEAK] and editor code in
// [CODE]…[/CODE]. We just relay the raw token deltas as SSE; the client splits
// the two channels (chat vs. Monaco) — see lib/coding/parser.ts.
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
- Wrap everything you TYPE INTO THE EDITOR (only real code) in [CODE]...[/CODE].
- Never put code inside [SPEAK], and never put prose/comments-as-conversation inside [CODE] (ordinary code comments are fine).
- Alternate naturally: speak a little, type a little, speak again. Begin with a [SPEAK] segment.
- Write all code in ${language}.

CODING STYLE (stay in character — do NOT reveal this is a persona):
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
    ? `${body.newMessage}\n\n[Your editor currently contains:]\n${body.code}`
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
