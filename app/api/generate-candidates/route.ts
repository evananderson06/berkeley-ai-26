import { NextRequest, NextResponse } from 'next/server'
import { Candidate } from '@/types'
import { anthropic } from '@/lib/anthropic'
import { v4 as uuidv4 } from 'uuid'

interface GenerateCandidatesRequest {
  jobTitle: string
  jobDescription: string
}

const CANDIDATE_TOOL = {
  name: 'create_candidates',
  description: 'Create an array of 5 job candidates for the interview simulation',
  input_schema: {
    type: 'object' as const,
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            initials: { type: 'string', description: 'Two uppercase letters from first + last name' },
            role: { type: 'string', description: 'The specific job title variant this candidate is applying for' },
            yearsExperience: { type: 'number' },
            summary: { type: 'string', description: '1–2 sentence summary visible on the candidate card' },
            skills: { type: 'array', items: { type: 'string' }, description: '5–8 relevant skills' },
            qualityTier: { type: 'string', enum: ['strong', 'adequate', 'poor'] },
            redFlags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Hidden concerns not obvious from resume — discovered only via good interview questions',
            },
            greenFlags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Genuine strengths this candidate has',
            },
            resumeStyle: {
              type: 'string',
              enum: ['classic', 'modern', 'executive', 'flashy', 'garish', 'chaotic'],
              description: 'Visual presentation style for the resume. classic=clean minimal; modern=two-column dark sidebar; executive=dark navy header formal serif; flashy=gradient emoji over-the-top; garish=dated Word-doc style with blue header and burgundy section headers; chaotic=inconsistent sizes and alignment.',
            },
            resume: {
              type: 'object',
              properties: {
                summary: { type: 'string', description: 'Resume summary paragraph' },
                experience: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      company: { type: 'string' },
                      title: { type: 'string' },
                      startDate: { type: 'string', description: 'e.g. Jan 2021' },
                      endDate: { type: 'string', description: 'e.g. Present or Dec 2023' },
                      bullets: { type: 'array', items: { type: 'string' }, description: '2–4 achievement bullets with specifics' },
                    },
                    required: ['company', 'title', 'startDate', 'endDate', 'bullets'],
                  },
                  description: '2–3 jobs',
                },
                education: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      institution: { type: 'string' },
                      degree: { type: 'string' },
                      year: { type: 'string' },
                    },
                    required: ['institution', 'degree', 'year'],
                  },
                },
                skills: { type: 'array', items: { type: 'string' }, description: 'Full skills list for the resume page' },
              },
              required: ['summary', 'experience', 'education', 'skills'],
            },
          },
          required: ['name', 'initials', 'role', 'yearsExperience', 'summary', 'skills', 'qualityTier', 'redFlags', 'greenFlags', 'resume', 'resumeStyle'],
        },
        minItems: 5,
        maxItems: 5,
      },
    },
    required: ['candidates'],
  },
}

// Each entry fires when we detect the Nth "yearsExperience" token in the streaming JSON,
// meaning Claude has started writing that candidate's core fields.
const CANDIDATE_MILESTONES = [
  { message: 'Creating candidate personas…', progress: 15 },
  { message: 'Drafting résumés…', progress: 30 },
  { message: 'Building career histories…', progress: 48 },
  { message: 'Hiding a few red flags…', progress: 65 },
  { message: 'Finishing up…', progress: 80 },
]

export async function POST(req: NextRequest) {
  const body: GenerateCandidatesRequest = await req.json()

  if (!body.jobTitle || typeof body.jobTitle !== 'string') {
    return NextResponse.json({ error: 'jobTitle is required' }, { status: 400 })
  }
  if (!body.jobDescription || typeof body.jobDescription !== 'string') {
    return NextResponse.json({ error: 'jobDescription is required' }, { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      try {
        send({ type: 'progress', message: 'Reviewing job requirements…', progress: 5 })

        let accumulatedJson = ''
        let candidatesDetected = 0

        const claudeStream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 8096,
          tools: [CANDIDATE_TOOL],
          tool_choice: { type: 'tool', name: 'create_candidates' },
          system: `You are a hiring simulation tool. Generate realistic, believable job candidates for interview practice.
Candidates should have plausible career histories at real-sounding companies with specific, quantified achievements.
Use diverse names. Make the candidates feel like real people, not archetypes.`,
          messages: [
            {
              role: 'user',
              content: `Generate 5 candidates for this role:

Job Title: ${body.jobTitle}
Job Description:
${body.jobDescription}

The 5 candidates must follow this exact distribution:
1. ONE clearly excellent candidate — deep relevant experience, specific achievements, matches the role well. qualityTier: "strong"
2. TWO adequate candidates — competent but unremarkable. One is slightly stronger. qualityTier: "adequate"
3. ONE deceptively impressive candidate — polished resume at name-brand companies, but hiding red flags (e.g. short tenures, vague ownership of claimed achievements, defensive when pressed on details). Their greenFlags should look great on paper. qualityTier: "poor"
4. ONE clearly underqualified candidate — genuine enthusiasm but not ready for this level. qualityTier: "poor"

Tailor every candidate specifically to this job and industry. Use realistic metrics and timelines. The deceptive candidate's resume should look genuinely impressive — the red flags are only discoverable through careful interview questions.

RESUME STYLE ASSIGNMENT — assign one resumeStyle per candidate:
- "executive": Dark navy header, formal serif body, gold accents. Use for the strong candidate — polished and authoritative.
- "modern": Two-column layout with dark sidebar. Use for one of the adequate candidates — clean and contemporary.
- "classic": Clean minimal black-and-white. Use for the other adequate candidate — straightforward and safe.
- "flashy": Purple-pink gradient header, emoji section headers (✨ ⚡ 🏆 🎓), each section in a different coloured rounded box. Use for the deceptive poor candidate — looks impressive and try-hard at first glance.
- "garish": Dated Word-document style — blue-tinted header, burgundy ALL CAPS section headers with double border lines, a generic Objective paragraph, skills in a 3-column checkmark table, alternating gray row shading on experience. Looks like a 2010 Word résumé template. Use for the clearly underqualified poor candidate.
- "chaotic": Huge name, inconsistent font sizes, alternating left/right alignment per job. Assign to the clearly underqualified candidate only as an alternative to garish.

GRAMMAR & SPELLING ERRORS in resume text:
- For the clearly underqualified poor candidate (garish or chaotic style), introduce 3–5 realistic errors spread across their resume summary and bullet points. Use: typos ("responsable", "managment", "expirience", "gratuate"), grammar mistakes ("responsible of" not "for"), missing punctuation, random lowercase where capitals belong, run-on sentences. Errors should feel like a rushed first draft.
- The deceptive poor candidate must have flawless, impressive-sounding prose.
- Strong and adequate candidates must have polished, professional resume text with no errors.`,
            },
          ],
        })

        for await (const event of claudeStream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'input_json_delta'
          ) {
            accumulatedJson += event.delta.partial_json

            // "yearsExperience" appears exactly once per candidate — use it as a progress marker
            const detected = (accumulatedJson.match(/"yearsExperience"/g) ?? []).length
            if (detected > candidatesDetected) {
              candidatesDetected = detected
              const milestone = CANDIDATE_MILESTONES[candidatesDetected - 1]
              if (milestone) send({ type: 'progress', ...milestone })
            }
          }
        }

        const finalMessage = await claudeStream.finalMessage()
        const toolBlock = finalMessage.content.find((b) => b.type === 'tool_use')

        if (!toolBlock || toolBlock.type !== 'tool_use') {
          throw new Error(`No tool_use block. stop_reason: ${finalMessage.stop_reason}`)
        }

        const input = toolBlock.input as Record<string, unknown>
        const rawCandidates = input['candidates']

        if (!Array.isArray(rawCandidates)) {
          throw new Error(`Expected candidates array, got ${typeof rawCandidates}`)
        }

        const withIds: Candidate[] = (rawCandidates as Omit<Candidate, 'id'>[]).map((c, i) => ({
          ...c,
          id: `c${i + 1}_${uuidv4().slice(0, 8)}`,
        }))

        send({ type: 'progress', message: 'Ready!', progress: 100 })
        send({ type: 'done', candidates: withIds })
      } catch (err) {
        console.error('[generate-candidates]', err)
        send({ type: 'error', message: 'Failed to generate candidates' })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
