# InterviewIQ

**An AI hiring simulator.** You play the *interviewer*: enter a role, get a pool of eight realistic AI candidates, interview them by voice (or text) — including live coding questions in a shared editor — then commit to a hire. The app grades **you** on how well you interviewed and whether you picked the right person, revealing the hidden truth about each candidate you couldn't see going in.

The twist: each candidate has a **hidden "truthfulness profile"** (how good they really are, what they're hiding) that never reaches the browser. A polished résumé can hide a weak hire; a nervous, stuttering candidate might be the best in the pool. Your job is to find out through the conversation.

---

## Table of contents

1. [Quickstart](#quickstart)
2. [Environment variables](#environment-variables)
3. [The full user journey](#the-full-user-journey)
4. [How it works (architecture)](#how-it-works-architecture)
5. [The candidate simulation](#the-candidate-simulation)
6. [The voice interview pipeline](#the-voice-interview-pipeline)
7. [Pages](#pages)
8. [API routes](#api-routes)
9. [State & data model](#state--data-model)
10. [Project structure](#project-structure)
11. [Tech stack](#tech-stack)
12. [Configuration & tuning](#configuration--tuning)
13. [Troubleshooting](#troubleshooting)
14. [Security notes](#security-notes)

---

## Quickstart

**Prerequisites**

- **Node.js 18.18+** (or 20+) and npm
- An **Anthropic API key** (required — powers every AI feature)
- A **Deepgram API key** (required for the voice interview; the rest of the app works without it)
- A modern Chromium-based browser (the voice mode uses the microphone, Web Audio API, and `MediaRecorder`)

**Install & run**

```bash
npm install

# create .env.local (see the next section) and fill in your keys
cp .env.local.example .env.local   # if present; otherwise create it by hand

npm run dev
```

Open **http://localhost:3000**.

**Scripts**

| Command | What it does |
|---|---|
| `npm run dev` | Start the Next.js dev server on `:3000` |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint (`next lint`) |

> First voice interview will prompt for **microphone permission**. **Headphones are recommended** — on open speakers the candidate's own voice can leak into the mic and trip the "interrupt" detector (tunable; see [Configuration](#configuration--tuning)).

---

## Environment variables

Create `.env.local` in the project root. **Never commit real keys** (`.env.local` should be git-ignored).

| Variable | Required? | Used for |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Candidate generation, the interview agent, the post-interview summary, and the final feedback. All Claude calls use `claude-sonnet-4-6`. |
| `DEEPGRAM_API_KEY` | **Yes (for voice)** | Minting short-lived browser tokens for speech-to-text (Nova-3) and text-to-speech (Aura-2). Server-side only. |
| `UPSTASH_REDIS_REST_URL` | Optional | Upstash Redis client. Wired up (`lib/redis.ts`) but **not currently on the hot path** — session state lives in the browser's `localStorage`. Safe to leave blank for local use. |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Token for the Redis client above. |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Sentry error monitoring. Sentry is configured but effectively **off** when this is empty. |
| `ARIZE_API_KEY` | Optional | Arize/OpenTelemetry tracing. Currently a **stub** (`lib/tracing.ts`); not active. |
| `NEXT_PUBLIC_APP_URL` | Optional | App base URL (defaults to `http://localhost:3000`). |

Example `.env.local` (placeholders — substitute your own):

```ini
ANTHROPIC_API_KEY="sk-ant-..."
DEEPGRAM_API_KEY="..."
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
NEXT_PUBLIC_SENTRY_DSN=
ARIZE_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## The full user journey

```
 ┌─────────────┐   generate 8 candidates    ┌──────────────┐   pick one to talk to   ┌──────────────────────┐
 │  Landing /  │ ─────────────────────────▶ │ Candidates   │ ──────────────────────▶ │ Résumé  /  Interview │
 │ (job title  │  POST /api/generate-        │ /candidates  │                          │  /candidates/[id]/…  │
 │  + JD)      │  candidate ×5 (parallel)    │              │ ◀──── back, repeat ────  │                      │
 └─────────────┘                            └──────┬───────┘                          └──────────┬───────────┘
                                                   │ "Make hiring decision"                      │ interview by voice/text
                                                   ▼                                             │ + live coding editor
                                            ┌──────────────┐   POST /api/generate-feedback  ┌────▼─────────────┐
                                            │ Decision      │ ─────────────────────────────▶ │ Verdict /feedback│
                                            │ /decision     │   (streaming SSE)              │ score + who you  │
                                            │ pick + reason │                                │ should've hired  │
                                            └──────────────┘                                └──────────────────┘
```

1. **Landing (`/`)** — Enter a **job title** and **job description**. On submit, the app fires **eight parallel** `POST /api/generate-candidate` calls (one per "slot" in a fixed pipeline of candidate archetypes), shows a progress loading screen, then saves the resulting candidates to `localStorage` and routes to the pool.

2. **Candidates (`/candidates`)** — A grid of the 8 candidates (avatar, role, years, skills). Each card links to the candidate's **résumé** and to **interview** them. Once interviewed, a card shows an "Interviewed" badge and a jot-note summary.

3. **Résumé (`/candidates/[id]/resume`)** — The candidate's résumé, rendered in one of **six visual formats** (classic, modern, executive, flashy, garish, …) chosen at generation time. This is a *document* the candidate "submitted," so it's deliberately styled like a real résumé, not like the app.

4. **Interview (`/candidates/[id]/interview`)** — The core experience. A three-pane workspace:
   - **Left:** a voice "call" view (an animated avatar that reacts to who's speaking and your mic level) with an optional **transcript toggle**, a **mute** button, a barge-in level meter, and a **text box** to type questions.
   - **Center:** a read-only **Monaco code editor**. When you ask a coding question, the candidate "thinks out loud while typing" — narration and code play back **line by line, in sync**.
   - **Right:** your private **interview notes**.
   - A **"View résumé"** button opens the résumé in a dialog without leaving the call.
   - Voice is **always-on**: it connects automatically and just listens; talk naturally. **End interview** generates a jot-note summary (shown on a loading screen) and returns you to the pool.

5. **Decision (`/decision`)** — Review every candidate's summary + your notes, pick who you'd hire, and write your reasoning. Submitting streams progress while Claude evaluates everything.

6. **Verdict (`/feedback`)** — Your score (0–100), whether you picked the **objectively correct hire**, what you did well, where to sharpen, and key moments pulled from your transcripts.

---

## How it works (architecture)

A single **Next.js 14 (App Router)** app. The browser holds all session state (`localStorage`); Next.js **route handlers** under `app/api/*` are thin servers around two external services:

- **Anthropic Claude** (`claude-sonnet-4-6`) — candidate generation, the interview roleplay, the post-interview summary, and the final feedback. Structured outputs use **forced tool-use**; conversational/coding replies are plain text (the feedback and coding routes **stream** via Server-Sent Events).
- **Deepgram** — speech-to-text (**Nova-3**) and text-to-speech (**Aura-2**). The browser talks to Deepgram **directly over WebSockets**; the server only mints a short-lived (~30s) access token so the long-lived `DEEPGRAM_API_KEY` never reaches the client.

**Why the hidden profile stays server-side:** each candidate's true quality, red/green flags, and coaching tiers are sent into Claude's *system prompt* on the server. The browser only ever receives the "clean" candidate (name, role, résumé, skills) — so the interviewer genuinely has to discover the truth, and the final feedback can grade them against information they never had.

---

## The candidate simulation

This is what makes the interviews feel real. Each candidate is generated for the specific job, with a **hidden behavioral profile** the interview agent role-plays.

**Quality ladder (true quality — hidden from the interviewer).** Candidates are rated on a five-rung ladder that drives their behavior and the "correct hire": **exceptional › strong › adequate › mediocre › poor**.

**The slate (8 archetypes).** Each pool is generated from a fixed set of eight archetypes so it spans the realistic spectrum — including two *traps*: a genuinely strong candidate who interviews modestly, and a weak one who looks impressive on paper.

| Archetype (`tierSpec`) | True tier | Behaves like |
|---|---|---|
| `exceptional_standout` | exceptional | The clear best hire — deep, quantified, sharp judgment. **(The "correct" pick.)** |
| `strong_solid` | strong | Genuinely good — confident and reliable. |
| `strong_understated` | strong | **Trap:** genuinely strong but humble and soft-spoken — easy to undervalue. |
| `adequate_senior` | adequate | Competent but vague; speaks in generalities. |
| `adequate_junior` | adequate | Promising but a notch below; gaps in depth. |
| `mediocre_coaster` | mediocre | Coasts; shallow/second-hand understanding, leans on team & tools. |
| `poor_deceptive` | poor | **Trap:** impressive on paper, hiding real red flags; cracks only under careful probing. |
| `poor_underqualified` | poor | Enthusiastic but not ready; overestimates themselves (résumé even has typos). |

The count and mix are just the `CANDIDATE_PIPELINE` array in `app/page.tsx` — add, remove, or re-tier slots freely.

**Rings of knowledge (scope of competence).** The interview agent treats its knowledge as three concentric rings and decides which one a question falls in:

1. **On the résumé / in their field** → answers fully and engages (it assumes this is exactly what's being assessed).
2. **Adjacent/similar concepts** → still gives a genuine best guess, hedging where unsure — doesn't deflect.
3. **Unrelated to the job** → gives a vague-or-probably-wrong best guess, then **steers back** to the role. It will not suddenly produce expert knowledge from a field that isn't theirs (e.g. a growth marketer asked to solve a hard algorithm).

**Coding behavior.** Coding questions follow the same rings:
- If the candidate is genuinely an engineer (per their role/résumé), they attempt the problem at a **coding archetype** quality keyed to their tier (`articulate-ace`, `quiet-star`, `steady-mid`, `eager-struggler`, `confident-exaggerator`).
- If coding isn't their background, they make a short, clearly-wrong stab and steer back.
- **Struggle scales** with the problem's difficulty *relative to their experience* — routine problems flow; hard problems (especially for a junior) produce false starts, dead ends, and partial/buggy attempts.

**Speech disfluency (stutter).** Each candidate has a stable, per-candidate verbal habit — `none` / `mild` / `moderate` / `heavy` — seeded from a hash of their ID. It's **deliberately uncorrelated with quality**: the best hire might stutter constantly and the worst might be perfectly fluent. It only colors the *spoken* narration, never the code.

**Embellishment.** Candidates may exaggerate, round up, or invent plausible specifics the way real people do — weaker/deceptive candidates inflate and claim credit they didn't earn; strong ones don't need to. Inconsistencies surface under pressure.

> All of the above lives in the **system prompt**, server-side (`app/api/interview/code/route.ts`, `app/api/interview/route.ts`, `lib/coding/persona.ts`). It is never sent to the browser.

---

## The voice interview pipeline

Orchestrated client-side by `lib/voice/useVoiceInterview.ts`:

```
🎙 mic ──▶ MediaRecorder (webm/opus, 250ms chunks) ──▶ Deepgram STT (Nova-3, raw WebSocket)
                                                              │ final transcript / turn-end
                                                              ▼
                                       POST /api/interview/code  (Claude, streaming SSE)
                                                              │ [SPEAK] narration + [CODE]/[EDIT]/[DELETE] ops
                                  ┌───────────────────────────┴───────────────────────────┐
                                  ▼                                                         ▼
                    Deepgram Aura-2 TTS (raw WS, linear16 24kHz)              Monaco editor "types" the code
                                  │  candidate's voice                       line-by-line, paced to the speech
                                  ▼
                         🔊 Web Audio playback
```

Key behaviors:

- **Always-on with mute.** The session connects automatically when the page loads; there's no start/stop, just a **mute** toggle. Talk naturally.
- **Barge-in.** While the candidate is speaking, if your mic level (RMS) stays above a **threshold** for a debounce window, the app stops the candidate and listens — like interrupting a real person. The threshold is exposed as a live slider.
- **Line-by-line code sync.** Coding replies interleave spoken narration (`[SPEAK]…`) with editor operations (`[CODE]`, `[EDIT]`, `[DELETE]`, `[CLEAR]`). A playback runner types each line of code over the duration of the sentence that explains it, so speech and typing stay together. The editor is patched **in place** across turns (follow-ups edit existing code rather than rewriting it). See `lib/coding/parser.ts`, `lib/coding/playback.ts`, `lib/coding/edits.ts`.
- **Distinct voices.** Each candidate is assigned a stable Aura-2 voice (hashed from their ID).
- **Resilience.** A session counter invalidates stale async work across reconnects; a watchdog prevents a stuck "speaking" state; the LLM fetch has a timeout with a graceful fallback line.

Browser ↔ Deepgram auth uses the `Sec-WebSocket-Protocol` subprotocol: `new WebSocket(url, [scheme, accessToken])`. The scheme is configurable (`DG_AUTH_SCHEME` in `lib/voice/config.ts`) and currently set to `'bearer'` — see [Troubleshooting](#troubleshooting) if sockets fail to open.

---

## Pages

| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Landing — job input + parallel candidate generation (with loading screen). |
| `/candidates` | `app/candidates/page.tsx` | Candidate pool grid. |
| `/candidates/[id]/resume` | `app/candidates/[id]/resume/page.tsx` | Full résumé in one of six formats. |
| `/candidates/[id]/interview` | `app/candidates/[id]/interview/page.tsx` | Voice/text interview + Monaco coding + notes + résumé dialog. |
| `/decision` | `app/decision/page.tsx` | Pick a hire and explain your reasoning (streams while evaluating). |
| `/feedback` | `app/feedback/page.tsx` | The verdict: score, correct hire, strengths, gaps, key moments. |

---

## API routes

All under `app/api/`. Claude calls use `claude-sonnet-4-6`.

| Route | Method | Streaming | Purpose |
|---|---|---|---|
| `/api/generate-candidate` | POST | No | Generate **one** candidate (forced tool-use) for a given slot/tier/résumé style. The landing page calls this 5× in parallel. |
| `/api/generate-candidates` | POST | No | Legacy multi-candidate generator (superseded by the per-candidate route above). |
| `/api/interview/code` | POST | **SSE** | **The live interview agent.** Handles every turn — conversation *and* coding — streaming `[SPEAK]`/`[CODE]` deltas. Carries the hidden persona + rings/struggle/disfluency rules. |
| `/api/interview` | POST | No | Legacy non-streaming text interview (kept as a fallback; not on the current UI path). |
| `/api/interview-summary` | POST | No | Writes 3–6 terse jot-note bullets after an interview ends. |
| `/api/generate-feedback` | POST | **SSE** | Final evaluation of the *interviewer*: score, correct hire, what-went-well, areas to improve, key moments. Streams progress steps. |
| `/api/deepgram-token` | POST | No | Mints a ~30s Deepgram access token for the browser. Never returns the long-lived API key. |
| `/api/save-notes` | POST | No | Accepts interview notes. **Currently a stub** (validates and returns success; Redis persistence is a TODO — notes live in `localStorage`). |

---

## State & data model

There is **no database on the hot path** — the entire session lives in the browser's `localStorage`, keyed per candidate. (Upstash Redis is wired in `lib/redis.ts` for future server-side sessions but isn't used at runtime.)

| `localStorage` key | Contents |
|---|---|
| `interviewiq_candidates` | The full array of generated candidates (clean profile only). |
| `interviewiq_job` | `{ jobTitle, jobDescription }`. |
| `interviewiq_messages_{id}` | Interview transcript (`Message[]`) for a candidate. |
| `interviewiq_code_{id}` | Current contents of the candidate's code editor. |
| `interviewiq_notes_{id}` | Your private notes for a candidate. |
| `interviewiq_completed_{id}` | `'true'` once an interview has ended. |
| `interviewiq_summary_{id}` | The generated jot-note summary. |
| `interviewiq_feedback` | The final feedback report. |

Core TypeScript types live in `types/index.ts` (`Candidate`, `Resume`, `Message`, `FeedbackReport`, …). The hidden fields on `Candidate` — `qualityTier`, `redFlags`, `greenFlags` — are sent to Claude server-side but are not surfaced in the UI.

> To start fresh, clear site data / `localStorage` for `localhost:3000`, or just generate a new pool from the landing page.

---

## Project structure

```
app/
  page.tsx                      Landing (candidate generation pipeline)
  layout.tsx                    Root layout, fonts, <Nav>
  globals.css                   Theme tokens (porcelain · pine · brass)
  candidates/
    page.tsx                    Candidate pool
    [id]/resume/page.tsx        Résumé view
    [id]/interview/page.tsx     Interview workspace (voice + code + notes)
  decision/page.tsx             Hiring decision
  feedback/page.tsx             Verdict
  api/
    generate-candidate/         Per-candidate generation (live)
    generate-candidates/        Multi-candidate generation (legacy)
    interview/code/             Live streaming interview agent
    interview/                  Legacy text interview
    interview-summary/          Post-interview jot notes
    generate-feedback/          Final interviewer evaluation (streaming)
    deepgram-token/             Short-lived browser token minting
    save-notes/                 Notes endpoint (stub)
components/
  nav.tsx, loading-screen.tsx, summary-notes.tsx
  code-editor.tsx               Monaco wrapper (read-only, auto-scroll)
  resume-templates.tsx          The six résumé formats + dispatcher
  ui/                           shadcn / base-ui primitives (card, button, dialog, …)
lib/
  anthropic.ts                  Anthropic SDK client
  voice/
    config.ts                   VOICE tuning knobs + voice assignment
    useVoiceInterview.ts        Voice orchestration hook
    mic.ts, stt.ts, tts.ts      Mic capture, Deepgram STT, Deepgram TTS
  coding/
    persona.ts                  Coding archetypes, speech disfluency, typing cadence
    parser.ts, playback.ts, edits.ts   [SPEAK]/[CODE] parsing + line-by-line playback
  data.ts                       Placeholder candidates / feedback (offline fallback)
  redis.ts, session.ts          Upstash Redis (not on hot path)
  tracing.ts                    Arize/OTel tracing stub
types/index.ts                  Shared types
```

---

## Tech stack

- **Framework:** Next.js 14.2 (App Router), React 18, TypeScript
- **Styling:** Tailwind CSS v3 + shadcn / `@base-ui` component primitives, `lucide-react` icons. Fonts: Geist Sans/Mono (local) + Newsreader (display).
- **AI:** `@anthropic-ai/sdk` (Claude `claude-sonnet-4-6`)
- **Voice:** `@deepgram/sdk` (server token minting) + raw browser WebSockets for STT (Nova-3) and TTS (Aura-2); Web Audio API for playback and mic RMS
- **Editor:** `@monaco-editor/react`
- **State:** browser `localStorage` (Upstash Redis available but unused at runtime)
- **Observability (optional/inactive):** Sentry (`@sentry/nextjs`), OpenTelemetry/Arize stub

---

## Configuration & tuning

Voice behavior is tuned in **`lib/voice/config.ts`**:

| Knob | Default | Meaning |
|---|---|---|
| `THRESHOLD` | `0.06` | Mic RMS that counts as you interrupting. Raise it if the candidate keeps interrupting itself on open speakers; lower it with headphones. (Also adjustable live via the slider in the interview UI.) |
| `DEBOUNCE_MS` | `200` | How long you must stay above the threshold for a real interrupt. |
| `STT_MODEL` | `nova-3` | Deepgram speech-to-text model. |
| `ENDPOINTING_MS` / `UTTERANCE_END_MS` | `300` / `1000` | Silence that ends your turn. |
| `TTS_MODEL` / `TTS_VOICES` | Aura-2 | Default voice + the rotation candidates are assigned from. |
| `SPEECH_RATE` | `1.2` | Candidate speech speed (code-typing sync scales with it). |
| `PLAYBACK_LEAD_S` | `0.2` | Jitter buffer; raise slightly if speech stutters at the start of replies. |
| `DG_AUTH_SCHEME` | `'bearer'` | WebSocket auth scheme for Deepgram. Flip to `'token'` if sockets won't open. |

---

## Troubleshooting

- **Voice never connects / sockets close immediately (401 before "open").** Flip `DG_AUTH_SCHEME` between `'bearer'` and `'token'` in `lib/voice/config.ts`. Granted tokens are JWTs and the bearer scheme is usually required. Also confirm `DEEPGRAM_API_KEY` is set and the `/api/deepgram-token` call returns an `accessToken`.
- **No microphone / no audio.** Grant mic permission when prompted; use a Chromium-based browser. Click anywhere once if the candidate's voice doesn't start (browsers require a user gesture to unlock audio).
- **The candidate interrupts itself.** You're on open speakers and its own voice is tripping barge-in — raise the barge-in slider / `THRESHOLD`, or use headphones.
- **Speech stutters at the start of a reply.** Nudge `PLAYBACK_LEAD_S` up a little.
- **`next build` fails with `Cannot find module for page: /api/interview`.** Stale build cache — delete `.next/` and rebuild (`rm -rf .next && npm run build`).
- **Everything AI fails.** Check `ANTHROPIC_API_KEY`. Server route errors are logged to the terminal with a `[route-name]` prefix.
- **Want a clean slate.** Clear `localStorage` for `localhost:3000` or generate a new candidate pool.

---

## Security notes

- **All API keys are server-side.** `ANTHROPIC_API_KEY` and `DEEPGRAM_API_KEY` are only read in `app/api/*` route handlers. The browser receives only a **short-lived (~30s) Deepgram token**, never a long-lived key.
- **The hidden candidate profile never reaches the client.** Quality tiers and red/green flags exist only in server-side prompts.
- **Never commit `.env.local`.** Keep it git-ignored. If real keys have ever been committed or shared, **rotate them** (regenerate in the Anthropic / Deepgram / Upstash dashboards).
