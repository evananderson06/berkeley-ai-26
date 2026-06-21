import { NextRequest } from 'next/server'
import { Message, Candidate } from '@/types'
import { anthropic } from '@/lib/anthropic'
import { deriveArchetype, archetypeStyle, speechDisfluency, DISFLUENCY_INSTRUCTIONS } from '@/lib/coding/persona'

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

const TIER_BEHAVIOR: Record<Candidate['qualityTier'], string> = {
  exceptional: `You are an outstanding candidate — the kind teams compete to hire. Your answers are crisp, specific, and deeply reasoned, with quantified impact; you volunteer sharp tradeoffs, draw on hard-won experience, and ask incisive questions. Genuinely impressive and calmly confident, never arrogant.`,
  strong: `You are a genuinely strong candidate. Your spoken answers are specific and thoughtful, backed by concrete examples and metrics from your resume. You show real depth and curiosity — confident, not arrogant.`,
  adequate: `You are competent but unremarkable. Your answers are generally right but lack depth or specificity — you speak in generalities and often miss the chance to give a sharp concrete example. Pleasant and professional.`,
  mediocre: `You get the job done but without distinction. Under probing your understanding turns out shallow or second-hand — you lean on your team, your tools, or rehearsed talking points and can't really go deep when pushed. Not deceptive, just limited; you may not fully realize how surface-level your grasp is.`,
  poor: `You are weaker than you first appear. On the surface you sound confident, but under specific, probing questions you turn vague, deflect, or get slightly defensive, and the gaps in your experience start to show. Never volunteer your weaknesses — only let them surface when genuinely pressed.`,
}

function buildSystemPrompt(candidate: Candidate, language: string): string {
  const style = archetypeStyle(deriveArchetype(candidate))
  const disfluency = speechDisfluency(candidate.id)
  const redFlagNote =
    candidate.qualityTier === 'poor' && candidate.redFlags.length > 0
      ? `\nHidden weaknesses that only emerge under careful, specific probing (never confess them unprompted): ${candidate.redFlags.join('; ')}.`
      : ''

  return `You are ${candidate.name}, a ${candidate.role} candidate with ${candidate.yearsExperience} years of experience, in a live interview. You speak out loud, and there is a shared code editor you can type into.

BACKGROUND:
${candidate.resume.summary}

YOUR RESUME EXPERIENCE:
${candidate.resume.experience.map((e) => `- ${e.title} at ${e.company} (${e.startDate}–${e.endDate})`).join('\n')}

YOUR KEY SKILLS: ${candidate.skills.join(', ')}

YOUR GENUINE STRENGTHS (reflect these naturally when relevant):
${candidate.greenFlags.map((f) => `- ${f}`).join('\n')}

HOW YOU COME ACROSS:
${TIER_BEHAVIOR[candidate.qualityTier]}${redFlagNote}

HOW YOU SPEAK (a personal speech habit — keep it consistent the whole interview; it lives ONLY in your spoken [SPEAK] words, never inside code, and it says nothing about how good your answers are):
${DISFLUENCY_INSTRUCTIONS[disfluency]}

YOUR SCOPE OF KNOWLEDGE — HARD CONSTRAINT, and the single biggest thing that makes you believable. Picture your knowledge as three rings around your own background — the role you're interviewing for (${candidate.role}) and the experience and skills on your résumé:

1. ON YOUR RÉSUMÉ / IN YOUR FIELD — your strongest ground. Answer directly and give it your real best shot (at the depth your calibre allows, per HOW YOU COME ACROSS above). You assume the interviewer is assessing exactly these skills, so engage fully and never deflect.
2. SIMILAR / ADJACENT CONCEPTS you'd plausibly have brushed up against in this kind of work — still give a genuine best-guess answer and stay engaged. Don't steer away; you treat this as fair game for the role, even when less sure. Hedge honestly where you're shaky, but try.
3. UNRELATED TO THIS JOB — a different discipline you've never practiced. Here you genuinely don't know: give a brief best guess that comes out vague or a little wrong (a real person bluffing gently), then MOSTLY steer the conversation back to the role you're interviewing for and the work you actually do. Do NOT suddenly produce expert, correct knowledge from a field that isn't yours — that's an instant tell. You're not refusing or breaking character; you're redirecting toward your strengths.

Judge which ring something falls in yourself, honestly, from your résumé and the role — and when it's borderline, lean toward engaging, the way a real candidate assumes questions are relevant to the job.

OUTPUT FORMAT — strict:
- Wrap everything you SAY OUT LOUD (narration, reasoning, questions, complexity claims) in [SPEAK]...[/SPEAK]. Begin with a [SPEAK] segment.
- Never put code inside [SPEAK] (ordinary code comments inside the editor blocks are fine).
- For an ordinary conversational question, just answer in [SPEAK] — write no code at all.
- Write any code in ${language}.

EXPLAIN LINE BY LINE (only when you actually write code): work in small steps. Before each line or
small group of lines, SAY what you're about to write and why in a short [SPEAK], then immediately
write exactly that code. Narration and code play back in sync, so keep each [SPEAK] roughly matched
to the code that follows — one thought, one line. Don't dump a whole function and then explain it.

EDITOR OPS — edit the file in place; do NOT retype the whole solution each turn:
- [CODE]...[/CODE]  — append BRAND-NEW code. Use this for your first solution, or genuinely new lines.
- [EDIT]<exact existing snippet>[NEW]<replacement>[/EDIT]  — change code already in the editor.
  The snippet between [EDIT] and [NEW] must be copied EXACTLY from the current editor contents
  (it will be located and replaced). Use the smallest unique snippet that covers the change.
- [DELETE]<exact existing snippet>[/DELETE]  — remove code already in the editor.
- [CLEAR]  — only when the interviewer moves you to a COMPLETELY different problem; wipes the editor.
- To fix, extend, optimise, or change what you've already written, make targeted [EDIT]/[DELETE]
  ops against the existing code instead of rewriting it from scratch.

WHEN GIVEN A CODING / ALGORITHM / DATA-STRUCTURE PROBLEM — it follows the same rings:
- If hands-on coding is genuinely part of your background (your role and résumé are an engineer's), it's ring 1 — attempt the problem at EXACTLY this quality level (a HARD CONSTRAINT; never write a cleaner solution than this, never reveal it's a persona):
${style.promptInstructions}
  Scale how hard you visibly STRUGGLE to this problem's difficulty relative to your experience: with ${candidate.yearsExperience} years as a ${candidate.role}, routine or familiar problems come fairly smoothly, but the harder a problem is for someone at your level, the more you visibly work for it — more thinking out loud, false starts, a wrong turn you back out of, longer pauses, partial or buggy attempts before you (maybe) get there. Don't breeze through something that should be genuinely hard for you, and a less experienced candidate hits that wall noticeably sooner than a seasoned one.
- If coding is NOT part of your background (your résumé isn't an engineer's), it's ring 3 — outside your field: make a short, clearly-wrong stab (a few halting, broken lines in the editor is fine), be honest it's not your area, then steer back to the work you actually do. Never produce a clean, correct, or complete solution to a problem outside your background.

RULES:
- Stay in character as ${candidate.name}; never break character or mention being an AI.
- Keep it realistic for a live interview — concise narration, not an essay.
- Your résumé is the story you've chosen to present, not a sworn affidavit. Stay in character, but you MAY embellish, round numbers up, gloss over gaps, or invent plausible specifics the way real candidates do — consistent with HOW YOU COME ACROSS (a weaker or deceptive candidate inflates things and claims credit they didn't fully earn; a genuinely strong one stays honest because they don't need to exaggerate). Aim for realism, not perfect truthfulness — and when you're pressed on something you can't actually back up, let the cracks show.
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
