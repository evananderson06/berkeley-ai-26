import { NextRequest, NextResponse } from 'next/server'
import { Candidate } from '@/types'
import { anthropic } from '@/lib/anthropic'
import { v4 as uuidv4 } from 'uuid'

export interface CandidateSpec {
  jobTitle: string
  jobDescription: string
  index: number
  tierSpec: 'strong' | 'adequate_senior' | 'adequate_junior' | 'poor_deceptive' | 'poor_underqualified'
  resumeStyle: 'executive' | 'modern' | 'classic' | 'flashy' | 'garish'
  nameHint?: string       // pre-assigned full name — Claude must use this exactly
}

const TIER_PROMPTS: Record<CandidateSpec['tierSpec'], string> = {
  strong: `Generate ONE clearly excellent candidate. They have deep relevant experience, specific quantified achievements, and match the role well. qualityTier must be "strong". redFlags should be empty. greenFlags should list 3–4 genuine standout qualities.`,
  adequate_senior: `Generate ONE solid but unremarkable senior-level candidate. Competent, some relevant experience, but answers tend to be vague and they don't quite stand out. qualityTier must be "adequate". A couple of minor redFlags (e.g. limited scope, relies on tools without understanding them). 1–2 greenFlags.`,
  adequate_junior: `Generate ONE adequate but less experienced candidate. They have potential and enthusiasm but are a notch below the senior adequate candidate. qualityTier must be "adequate". redFlags around depth or breadth gaps. 1–2 greenFlags around coachability or initiative.`,
  poor_deceptive: `Generate ONE deceptively impressive candidate. Their resume looks great — name-brand companies, impressive-sounding titles. But they are hiding serious red flags discoverable only through careful interview questions: e.g. they claim credit for work they didn't drive, they have 3+ jobs in under a year each, they can't explain technical decisions they claim to have made, they become defensive when pressed. qualityTier must be "poor". greenFlags should describe how they LOOK on paper (polished, impressive titles, etc). redFlags should be the hidden concerns. Resume prose must be flawless.`,
  poor_underqualified: `Generate ONE clearly underqualified candidate. They're enthusiastic but simply not ready for this level. qualityTier must be "poor". Their resume should have 3–5 realistic grammar/spelling errors (typos like "responsable", "managment", "expirience"; grammar mistakes; run-on sentences — rushed first-draft quality). greenFlags: maybe 1 (enthusiasm or coachability). redFlags: limited experience, overestimates capability.`,
}

const STYLE_DESCRIPTIONS: Record<CandidateSpec['resumeStyle'], string> = {
  executive: 'executive — dark navy header, formal serif body, polished and authoritative',
  modern: 'modern — two-column layout with dark sidebar, clean and contemporary',
  classic: 'classic — clean minimal black-and-white, straightforward and safe',
  flashy: 'flashy — purple-pink gradient header, emoji section headers (✨ ⚡ 🏆 🎓), coloured rounded section boxes, try-hard and over-the-top',
  garish: 'garish — dated Word-document style with blue-tinted header, burgundy ALL CAPS section headers, generic Objective paragraph, skills in a checkmark table, alternating grey row shading',
}

const SINGLE_CANDIDATE_TOOL = {
  name: 'create_candidate',
  description: 'Create a single job candidate for the interview simulation',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string' },
      initials: { type: 'string', description: 'Two uppercase letters from first + last name initials' },
      role: { type: 'string', description: 'The specific job title variant this candidate has' },
      yearsExperience: { type: 'number' },
      summary: { type: 'string', description: '1–2 sentence summary for the candidate card' },
      skills: { type: 'array', items: { type: 'string' }, description: '5–8 relevant skills' },
      qualityTier: { type: 'string', enum: ['strong', 'adequate', 'poor'] },
      resumeStyle: { type: 'string', enum: ['classic', 'modern', 'executive', 'flashy', 'garish'] },
      redFlags: { type: 'array', items: { type: 'string' } },
      greenFlags: { type: 'array', items: { type: 'string' } },
      resume: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          experience: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                company: { type: 'string' },
                title: { type: 'string' },
                startDate: { type: 'string' },
                endDate: { type: 'string' },
                bullets: { type: 'array', items: { type: 'string' } },
              },
              required: ['company', 'title', 'startDate', 'endDate', 'bullets'],
            },
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
          skills: { type: 'array', items: { type: 'string' } },
        },
        required: ['summary', 'experience', 'education', 'skills'],
      },
    },
    required: ['name', 'initials', 'role', 'yearsExperience', 'summary', 'skills', 'qualityTier', 'resumeStyle', 'redFlags', 'greenFlags', 'resume'],
  },
}

export async function POST(req: NextRequest) {
  try {
    const body: CandidateSpec = await req.json()

    if (!body.jobTitle || !body.jobDescription || !body.tierSpec || !body.resumeStyle) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      tools: [SINGLE_CANDIDATE_TOOL],
      tool_choice: { type: 'tool', name: 'create_candidate' },
      system: `You are a hiring simulation tool. Generate a single realistic, believable job candidate for interview practice. Use real-sounding companies with specific, quantified achievements. Make this person feel like a real human being, not a stereotype.`,
      messages: [
        {
          role: 'user',
          content: `Generate a candidate for this role:

Job Title: ${body.jobTitle}
Job Description:
${body.jobDescription}
${body.nameHint ? `\nCANDIDATE NAME: The candidate's full name must be exactly "${body.nameHint}". Do not change it.\n` : ''}
CANDIDATE TYPE:
${TIER_PROMPTS[body.tierSpec]}

RESUME STYLE: ${STYLE_DESCRIPTIONS[body.resumeStyle]}
Set resumeStyle to "${body.resumeStyle}".

Tailor this candidate specifically to the job and industry. Use realistic dates and metrics.`,
        },
      ],
    })

    const toolBlock = message.content.find((b) => b.type === 'tool_use')
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error(`No tool_use. stop_reason: ${message.stop_reason}`)
    }

    const raw = toolBlock.input as Record<string, unknown>

    // Ensure all nested arrays exist even if Claude omitted them
    const resume = (raw.resume ?? {}) as Record<string, unknown>
    const candidate: Candidate = {
      id: `c${body.index + 1}_${uuidv4().slice(0, 8)}`,
      name: body.nameHint ?? (raw.name as string) ?? 'Unknown Candidate',
      initials: body.nameHint
        ? body.nameHint.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
        : (raw.initials as string) ?? 'UC',
      role: (raw.role as string) ?? body.jobTitle,
      yearsExperience: (raw.yearsExperience as number) ?? 0,
      summary: (raw.summary as string) ?? '',
      skills: Array.isArray(raw.skills) ? raw.skills as string[] : [],
      qualityTier: (raw.qualityTier as Candidate['qualityTier']) ?? 'adequate',
      resumeStyle: (raw.resumeStyle as Candidate['resumeStyle']) ?? body.resumeStyle,
      redFlags: Array.isArray(raw.redFlags) ? raw.redFlags as string[] : [],
      greenFlags: Array.isArray(raw.greenFlags) ? raw.greenFlags as string[] : [],
      resume: {
        summary: (resume.summary as string) ?? '',
        experience: Array.isArray(resume.experience)
          ? (resume.experience as Record<string, unknown>[]).map((job) => ({
              company: (job.company as string) ?? '',
              title: (job.title as string) ?? '',
              startDate: (job.startDate as string) ?? '',
              endDate: (job.endDate as string) ?? '',
              bullets: Array.isArray(job.bullets) ? job.bullets as string[] : [],
            }))
          : [],
        education: Array.isArray(resume.education)
          ? (resume.education as Record<string, unknown>[]).map((edu) => ({
              institution: (edu.institution as string) ?? '',
              degree: (edu.degree as string) ?? '',
              year: (edu.year as string) ?? '',
            }))
          : [],
        skills: Array.isArray(resume.skills)
          ? resume.skills as string[]
          : Array.isArray(raw.skills) ? raw.skills as string[] : [],
      },
    }

    return NextResponse.json({ candidate })
  } catch (err) {
    console.error('[generate-candidate]', err)
    return NextResponse.json({ error: 'Failed to generate candidate' }, { status: 500 })
  }
}
