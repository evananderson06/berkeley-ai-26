# InterviewIQ

**An AI hiring simulator.** You play the *interviewer*: enter a role, get a pool of three realistic AI candidates, interview them by voice (or text) — including live coding questions in a shared editor — then commit to a hire. The app grades **you** on how well you interviewed and whether you picked the right person, revealing the hidden truth about each candidate you couldn't see going in.

The twist: each candidate has a **hidden "truthfulness profile"** (how good they really are, what they're hiding) that the UI never displays. A polished résumé can hide a weak hire; a nervous, stuttering candidate might be the best in the pool. Your job is to find out through the conversation.

---

## Table of contents

1. [Quickstart](#quickstart)
2. [Environment variables](#environment-variables)
3. [The full user journey](#the-full-user-journey)
4. [How it works (architecture)](#how-it-works-architecture)
5. [The multi-agent system](#the-multi-agent-system)
6. [The candidate simulation](#the-candidate-simulation)
7. [The voice interview pipeline](#the-voice-interview-pipeline)
8. [Pages](#pages)
9. [API routes](#api-routes)
10. [State & data model](#state--data-model)
11. [Project structure](#project-structure)
12. [Tech stack](#tech-stack)
13. [Configuration & tuning](#configuration--tuning)
14. [Troubleshooting](#troubleshooting)
15. [Security notes](#security-notes)

---

## Quickstart

**Prerequisites**

- **Node.js 18.17+** (20+ recommended) and npm — the floor comes from Next.js 14.2; the app itself declares no `engines`
- An **Anthropic API key** (required — powers every AI feature)
- A **Deepgram API key** (required for the voice interview; the rest of the app works without it)
- A modern Chromium-based browser (the voice mode uses the microphone, Web Audio API, and `MediaRecorder`)

**Install & run**

```bash
npm install

# Create .env.local in the project root by hand and fill in your keys
# (see the "Environment variables" section below for the template —
#  there is no committed .env.local.example to copy).

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
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Sentry error monitoring (read in `sentry.client/server/edge.config.ts`). Sentry is configured but effectively **off** when this is empty. |
| `ARIZE_API_KEY` | Optional | Arize/OpenTelemetry tracing. Currently a **stub** (`lib/tracing.ts`); not active. |

> **Build-time only (not needed in `.env.local` for local dev):** `next.config.mjs` reads `SENTRY_ORG`, `SENTRY_PROJECT`, and `CI` for Sentry source-map upload during `next build`. Leave them unset locally; CI sets them. These are the only other environment variables the repo reads.

Example `.env.local` (placeholders — substitute your own):

```ini
ANTHROPIC_API_KEY="sk-ant-..."
DEEPGRAM_API_KEY="..."
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
NEXT_PUBLIC_SENTRY_DSN=
ARIZE_API_KEY=
```

---

## The full user journey

```
 ┌─────────────┐   generate 3 candidates    ┌──────────────┐   pick one to talk to   ┌──────────────────────┐
 │  Landing /  │ ─────────────────────────▶ │ Candidates   │ ──────────────────────▶ │ Résumé  /  Interview │
 │ (job title  │  POST /api/generate-        │ /candidates  │                          │  /candidates/[id]/…  │
 │  + JD)      │  candidate ×3 (parallel)    │              │ ◀──── back, repeat ────  │                      │
 └─────────────┘                            └──────┬───────┘                          └──────────┬───────────┘
                                                   │ "Make hiring decision"                      │ interview by voice/text
                                                   ▼                                             │ + live coding editor
                                            ┌──────────────┐   POST /api/generate-feedback  ┌────▼─────────────┐
                                            │ Decision      │ ─────────────────────────────▶ │ Verdict /feedback│
                                            │ /decision     │   (streaming SSE)              │ score + who you  │
                                            │ pick + reason │                                │ should've hired  │
                                            └──────────────┘                                └──────────────────┘
```

1. **Landing (`/`)** — Enter a **job title** and **job description**. On submit, the app fires **three parallel** `POST /api/generate-candidate` calls (a randomized slate of candidate archetypes — see below), shows a progress loading screen, then saves the resulting candidates to `localStorage` and routes to the pool.

2. **Candidates (`/candidates`)** — A grid of the 3 candidates (avatar, role, years, skills). Each card links to the candidate's **résumé** and to **interview** them. Once interviewed, a card shows an "Interviewed" badge and a jot-note summary.

3. **Résumé (`/candidates/[id]/resume`)** — The candidate's résumé, rendered in one of **five visual formats** (`classic`, `modern`, `executive`, `flashy`, `garish`) chosen at generation time. A sixth `chaotic` template lives in `components/resume-templates.tsx` for future use but isn't currently in the generation rotation. This is a *document* the candidate "submitted," so it's deliberately styled like a real résumé, not like the app.

4. **Interview (`/candidates/[id]/interview`)** — The core experience. A three-pane workspace:
   - **Left:** a voice "call" view (an animated avatar that reacts to who's speaking and your mic level) with a **mute** button and a barge-in level meter. A header **transcript toggle** swaps the avatar for the running transcript and reveals a **text box** to type questions (the text box is hidden in the default voice-only view).
   - **Center:** a read-only **Monaco code editor**. When you ask a coding question, the candidate "thinks out loud while typing" — narration and code play back **line by line, in sync**.
   - **Right:** your private **interview notes**.
   - A **"View résumé"** button opens the résumé in a dialog without leaving the call.
   - Voice is **always-on**: it connects automatically and just listens; talk naturally. **End interview** generates a jot-note summary (shown on a loading screen) and returns you to the pool.

5. **Decision (`/decision`)** — Review every candidate's summary + your notes, pick who you'd hire, and write your reasoning. Submitting streams progress while Claude evaluates everything.

6. **Verdict (`/feedback`)** — Your score (0–100), whether you picked the **objectively correct hire**, what you did well, where to sharpen, and key moments pulled from your transcripts.

---

## How it works (architecture)

A single **Next.js 14 (App Router)** app. The browser holds all session state (`localStorage`); Next.js **route handlers** under `app/api/*` are thin servers around two external services:

- **Anthropic Claude** (`claude-sonnet-4-6`) — candidate generation, the live interview agent, the post-interview summary, and the final feedback verdict. Structured outputs use **forced tool-use**; conversational/coding replies are plain text (the live interview and the feedback routes both **stream** via Server-Sent Events).
- **Deepgram** — speech-to-text (**Nova-3**) and text-to-speech (**Aura-2**). The browser talks to Deepgram **directly over WebSockets**; the server only mints a short-lived (~30s) access token so the long-lived `DEEPGRAM_API_KEY` never reaches the client.

**The hidden profile.** Each candidate has a true `qualityTier` (exceptional / strong / adequate / mediocre / poor) plus `redFlags` and `greenFlags`. Those fields drive Claude's *system prompts* on the server — the live interview agent uses them to roleplay correctly, the summary agent uses them as private context, and the final feedback agent uses them as ground truth. **The UI never displays these fields anywhere** (no badges, no debug panel, no resume hint), so on screen the interviewer genuinely has to discover the truth through the conversation. *Implementation honesty:* the full `Candidate` object is currently shipped to the client and kept in `localStorage` so that the decision page can POST it back to `/api/generate-feedback` without a database — a DevTools-savvy user could read it. The intended separation is described in `CONTEXT.md` §0.2/§4.1; production would move state behind Redis and serve only a `CandidatePublic` projection.

---

## The multi-agent system

**Four** Claude Sonnet 4.6 agents actually run across a session — the **Candidate Generator**, the **Live Interview Agent**, the **Interview Summary**, and the **Final Feedback** verdict — each with its own role, system prompt, and output contract. (There's also a built-but-unused text-interview fallback, and one planned-but-unbuilt agent — the Fit Assessor — both described below.) They are coordinated by the client (the candidate pool is built in parallel; the verdict is requested after the decision is made), and **the hidden candidate profile flows differently into each agent**, which is what makes the simulation work.

```
                                   ┌──────────────────────────────────────┐
                                   │  HIDDEN GROUND TRUTH (server-side)   │
                                   │  qualityTier · redFlags · greenFlags │
                                   └──────────────────────────────────────┘
                                                     │
        ┌────────────────────────────────────────────┼────────────────────────────────────┐
        ▼                                            ▼                                    ▼
 ┌──────────────┐     ┌──────────────────┐    ┌──────────────────┐              ┌────────────────────┐
 │ 1. CANDIDATE │     │ 2. LIVE INTERVIEW │    │ 3. INTERVIEW     │              │ 5. FINAL FEEDBACK  │
 │    GENERATOR │ ─▶  │    AGENT (voice + │ ─▶ │    SUMMARY       │ ─── . . . ──▶│    (the verdict)   │
 │  (×3 parallel)     │    coding, SSE)   │    │   (jot notes)    │              │   (streaming SSE)  │
 └──────────────┘     └──────────────────┘    └──────────────────┘              └────────────────────┘
       │                       ▲                      ▲                                   ▲
       │                       │ (fallback)           │                                   │
       │              ┌────────┴────────────┐         │                                   │
       │              │ 2b. TEXT INTERVIEW  │         │                                   │
       │              │    AGENT (legacy)   │         │                                   │
       │              └─────────────────────┘         │                                   │
       │                                              │                                   │
       └──── public résumé/role/skills ───────────────┴────── transcripts + notes ────────┘
```

### 1. Candidate Generator — `POST /api/generate-candidate`

Generates **one** realistic candidate per call against a specific `tierSpec` (one of eight archetypes — see [The candidate simulation](#the-candidate-simulation)) and `resumeStyle`. Uses **forced tool-use** (`create_candidate`) to return a fully-typed `Candidate` (name, initials, role, years, skills, résumé, plus the hidden `qualityTier` / `redFlags` / `greenFlags`).

The landing page fires **3 of these in parallel** from a randomized slate built by `buildSlate()` in [app/page.tsx](app/page.tsx) — exactly one slot is drawn from `GOOD_FIT_ARCHETYPES` (weighted toward `strong`, with `adequate` as the floor) so every pool has a defensible hire; the other two are drawn from `ALL_ARCHETYPES` (the full spread, including the deceptive trap); finally the order is shuffled so the good fit never sits in the same position. Names are picked from a distinct list so no two share a first name.

### 2. Live Interview Agent (voice + coding) — `POST /api/interview/code`

The agent the interviewer actually talks to. **Streams Server-Sent Events** so spoken narration and editor actions flow into the browser in real time. The system prompt fuses several layers into a single persona:

- **Identity** — name, role, résumé, skills (sent to Claude verbatim).
- **Behavioral tier** — five behavior blocks keyed on `qualityTier` (exceptional → poor), with the hidden `redFlags` injected for the `poor` tier so they only surface under careful probing.
- **Coding archetype** — `lib/coding/persona.ts` maps the tier (+ communication green flags) onto one of five coding personas: `articulate-ace`, `quiet-star`, `steady-mid`, `eager-struggler`, `confident-exaggerator`. This controls how the candidate **codes** (typing cadence, correctness, whether they bluff their complexity claim) — independent of how they **talk**.
- **Speech disfluency** — a stable per-candidate verbal habit (`none` / `mild` / `moderate` / `heavy`) seeded from a hash of the candidate id, deliberately **uncorrelated** with quality.
- **Rings of knowledge** — three concentric rings (on-résumé / adjacent / unrelated) that constrain how broadly the candidate will engage; prevents a growth marketer from suddenly writing perfect algorithms.

The model outputs a custom protocol: spoken parts wrapped in `[SPEAK]…[/SPEAK]`, plus four editor ops — `[CODE]` (append), `[EDIT]old[NEW]new[/EDIT]` (in-place find-and-replace), `[DELETE]old[/DELETE]`, `[CLEAR]`. The client's playback runner ties them together so each line of code types out **across the duration of the spoken sentence that explains it** (line-by-line sync). The editor is **not wiped between turns** — the current contents are sent back as context so follow-ups patch the existing solution rather than rewriting it.

### 2b. Text Interview Agent (fallback) — `POST /api/interview`

Non-streaming, text-only roleplay using the same `qualityTier` + `redFlags` + rings-of-knowledge persona as the live agent. Not on the current UI path (the interview page always uses the live agent), but kept as a safety fallback and for anyone wiring up a non-voice flow.

### 3. Interview Summary Agent — `POST /api/interview-summary`

Runs once when the interviewer clicks **End interview**. Reads the full transcript + the hidden tier/flags and produces **3–6 short jot-note bullets** in a hiring manager's shorthand — what was covered, where the candidate was crisp, where they hedged. Explicitly instructed to use the hidden notes to *gauge accuracy* but **not to reveal them outright** ("that's the verdict's job"). The bullets show up next to each candidate card on the pool page and on the decision page.

### 4. (Reserved) Fit Assessor

Originally planned in `CONTEXT.md` §7.4 as a separate post-interview rescoring pass. **Not built** — the final feedback agent collapses scoring into its single end-of-session call instead.

### 5. Final Feedback Agent (the verdict) — `POST /api/generate-feedback`

Streams Server-Sent Events (progress steps trickle out at ~1.8s intervals while Claude is generating). Receives **everything**: all candidates with their hidden tiers and flags, every transcript, every note, the interviewer's pick, and the interviewer's reasoning. Uses **forced tool-use** (`generate_feedback`) to return a structured `FeedbackReport`:

- `overallScore` (0–100)
- `whatWentWell` (3–5 specific things, ideally with quotes)
- `areasForImprovement` (3–5 concrete misses)
- `correctHire` (the candidate id of the objectively best hire by true tier — `exceptional > strong > adequate > mediocre > poor`)
- `userPickedCorrectly` (boolean)
- `keyMoments` (2–4 direct quotes from the transcripts + commentary)

The system prompt explicitly tells the agent to reward the interviewer for **seeing through both traps**: undervaluing a quiet-but-strong candidate is a mistake, *and* being fooled by a polished weak one is a mistake.

### Why this works as a multi-agent system

Each agent only sees the slice it needs, and the **same hidden profile reaches them in different ways**:

| Agent | Sees `qualityTier`/flags? | Allowed to reveal them? |
|---|---|---|
| Candidate Generator | Sets them (per-spec) | n/a (they ARE the output) |
| Live Interview Agent | Yes (in system prompt) | **No** — must roleplay, never break character |
| Interview Summary | Yes (private context) | **No** — sets tone but doesn't label |
| Final Feedback | Yes (ground truth) | **Yes** — this is the reveal |

So the *same* facts shape the candidate's behavior, color the summary's tone, and become the final scorecard — without ever leaking onto the screen before the verdict.

---

## The candidate simulation

This is what makes the interviews feel real. Each candidate is generated for the specific job, with a **hidden behavioral profile** the interview agent role-plays.

**Quality ladder (true quality — hidden from the interviewer).** Candidates are rated on a five-rung ladder that drives their behavior and the "correct hire": **exceptional › strong › adequate › mediocre › poor**.

**The slate (3 candidates, randomized).** Each session draws **3** candidates at random from the archetypes below — but **one slot is always a genuine good fit** (drawn from the good-fit archetypes, weighted toward `strong`, with `adequate` as the floor — never worse), so there's always a defensible hire. The other two can be anything, and the order is shuffled so position never gives away the answer. Two of the archetypes are deliberate *traps*: a genuinely strong candidate who interviews modestly, and a weak one who looks impressive on paper. (Pool size + weighting live in `buildSlate()` / the archetype arrays in `app/page.tsx`.)

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

The count and mix live in `buildSlate()` (plus the `GOOD_FIT_ARCHETYPES` and `ALL_ARCHETYPES` arrays) in `app/page.tsx` — add, remove, or re-tier slots freely. `POOL_SIZE` controls how many candidates are generated.

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

> All of the above lives in the **system prompt**, server-side, and is never sent to the browser. The full set — tiers, rings, coding archetypes, disfluency, and embellishment — is built in `app/api/interview/code/route.ts` (with `lib/coding/persona.ts`). The legacy text route `app/api/interview/route.ts` carries only tiers, rings, and embellishment (no speech disfluency or coding archetypes).

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
| `/api/generate-candidate` | POST | No | Generate **one** candidate (forced tool-use) for a given slot/tier/résumé style. The landing page calls this 3× in parallel from a randomized slate (`buildSlate()`). |
| `/api/generate-candidates` | POST | **SSE** | Legacy multi-candidate generator (superseded by the per-candidate route above). Streams `text/event-stream` progress events plus a final payload; no longer called by the UI. |
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
| `interviewiq_candidates` | The full array of generated `Candidate` objects — note these currently include the hidden `qualityTier` / `redFlags` / `greenFlags` fields, not a sanitized public projection (see the [architecture](#how-it-works-architecture) and [security](#security-notes) notes). |
| `interviewiq_job` | `{ jobTitle, jobDescription }`. |
| `interviewiq_messages_{id}` | Interview transcript (`Message[]`) for a candidate. |
| `interviewiq_code_{id}` | Current contents of the candidate's code editor. |
| `interviewiq_notes_{id}` | Your private notes for a candidate. |
| `interviewiq_completed_{id}` | `'true'` once an interview has ended. |
| `interviewiq_summary_{id}` | The generated jot-note summary. |
| `interviewiq_feedback` | The final feedback report. |

> `lib/session.ts` also defines an `interviewiq_session_id` key (a client UUID intended for future server-side sessions), but its helpers (`getOrCreateSessionId` / `clearSession`) have no callers — it's dead code, never written at runtime, so it's excluded from the table above.

Core TypeScript types live in `types/index.ts` (`Candidate`, `Resume`, `Message`, `FeedbackReport`, …). The hidden fields on `Candidate` — `qualityTier`, `redFlags`, `greenFlags` — drive every Claude system prompt server-side and are **never surfaced in the UI**. They do currently ride along in the client-side `Candidate` object (so the decision page can POST them back to `/api/generate-feedback` without a backing database) — see the [architecture](#how-it-works-architecture) note on this.

> To start fresh, clear site data / `localStorage` for `localhost:3000`, or just generate a new pool from the landing page.

---

## Project structure

```
app/
  page.tsx                      Landing (candidate generation pipeline)
  layout.tsx                    Root layout, fonts
  globals.css                   Theme tokens (porcelain · pine · brass)
  fonts/                        Geist Sans/Mono local font files
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
  loading-screen.tsx, summary-notes.tsx
  code-editor.tsx               Monaco wrapper (read-only, auto-scroll)
  resume-templates.tsx          Résumé formats (5 in active rotation + a chaotic template) + dispatcher
  ui/                           shadcn / base-ui primitives (card, button, dialog, …)
lib/
  anthropic.ts                  Anthropic SDK client
  utils.ts                      cn() class-name helper (clsx + tailwind-merge)
  voice/
    config.ts                   VOICE tuning knobs + voice assignment
    useVoiceInterview.ts        Voice orchestration hook
    mic.ts, stt.ts, tts.ts      Mic capture, Deepgram STT, Deepgram TTS
    pronounce.ts                Spoken-form normalization for TTS (big-O, dotted ids)
  coding/
    persona.ts                  Coding archetypes, speech disfluency, typing cadence
    parser.ts, playback.ts, edits.ts   [SPEAK]/[CODE] parsing + line-by-line playback
  data.ts                       Placeholder candidates / feedback (offline fallback)
  redis.ts, session.ts          Upstash Redis + client session id (neither on hot path)
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
- **`next build` fails with a stale build-cache error.** A generic Next.js issue — delete the `.next/` cache and rebuild. PowerShell: `Remove-Item -Recurse -Force .next; npm run build` (macOS/Linux: `rm -rf .next && npm run build`).
- **Everything AI fails.** Check `ANTHROPIC_API_KEY`. Server route errors are logged to the terminal with a `[route-name]` prefix.
- **Want a clean slate.** Clear `localStorage` for `localhost:3000` or generate a new candidate pool.

---

## Security notes

- **All API keys are server-side.** `ANTHROPIC_API_KEY` is read in `lib/anthropic.ts` (a server-only module imported solely by `app/api/*` routes); `DEEPGRAM_API_KEY` is read in the `app/api/deepgram-token` route handler. Neither is ever bundled to the client — the browser receives only a **short-lived (~30s) Deepgram token**, never a long-lived key.
- **The hidden candidate profile is never displayed.** `qualityTier` / `redFlags` / `greenFlags` are only ever rendered into Claude system prompts and the final verdict. The fields ride along in the client-side `Candidate` blob today (so the decision page can POST them back without a database) — a determined user could read them in DevTools. Production deployments should move session state behind Redis and project to a `CandidatePublic` shape before serialization (see `CONTEXT.md` §4.1).
- **Never commit `.env.local`.** Keep it git-ignored. If real keys have ever been committed or shared, **rotate them** (regenerate in the Anthropic / Deepgram / Upstash dashboards).
