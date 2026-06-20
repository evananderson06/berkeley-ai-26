# Project Context & Build Plan — AI Hiring Simulator

> **Authored by:** Claude Opus 4.8. Original plan + 5-expert review pass, then **re-architected to the actual repo (all-TypeScript Next.js)** and the real product flow (2026-06-20).
> **Status:** Planning locked. Single source of truth for architecture, API contract, agents, prompts, schemas, build sequence.
>
> **Repo reality:** the committed template ("InterviewIQ") is a **Next.js 14 (App Router) TypeScript** app — shadcn/ui, Upstash Redis, Sentry (wired), `@anthropic-ai/sdk` + `@deepgram/sdk` installed, OpenTelemetry/Arize tracing stub. The candidates→resume→interview→decision→feedback flow exists but **every agent route is stubbed** (`PLACEHOLDER_*`, `// TODO: real Claude`). We build on it.
>
> **Project name (TBD):** template ships as **InterviewIQ**. Candidates: *Candid*, *Tell*, *Bench*, *Second Chair*, *Bluff*. Decide before the Devpost draft; this doc uses **Candid**.

---

## 0. The Decisions That Shape Everything

| Decision | Choice | Consequence |
|---|---|---|
| **Stack** | **All-TypeScript**, build on the existing Next.js template | No Python. Agents = Next.js API routes; voice bridge = a Node WS server. Reuses the installed Anthropic + Deepgram JS SDKs, Upstash Redis, Sentry, and the whole UI scaffold. |
| **Voice architecture** | **Manual pipeline**: Deepgram STT (WS) → streaming LLM → Deepgram Aura-2 TTS (WS), orchestrated server-side | Full control + the live observer hook. Turn-taking handled via Deepgram endpointing (§3.3). **Runs as a separate Node WS server process**, not a Next.js route (§0.1). |
| **Product** | **AI hiring simulator with a verdict** (not bias-coaching) | A founder enters a job + company, an **Overseer** invents candidates whose resumes over/under/accurately represent them, the founder voice-interviews them, and a **Final Verdict** agent says who they should've hired and what they missed. Track: **Ddoski's Toolbox** (a tool for founders who can't interview well). |
| **Model switcher** | Founder picks **Fast/cheap (OpenAI gpt-4o-mini)** or **Best (Claude)** once at session start | One `model_provider`, set at start, immutable. All 5 agents go through one `model_router.ts`. No provider mixing mid-session. |
| **Time triage** | **Strict MVP of the full loop first** (tagged gate, §10) | Thin loop: job input → Overseer → pick → voice interview → per-interview summary. Assessor + Verdict wired after the voice loop is solid. |

**The pitch:** *Most founders are bad interviewers and can't tell who's embellishing. Candid generates realistic candidates — some honest, some inflated — lets you voice-interview them, then tells you who you actually should have hired, where the resumes lied, and what you let slide.*

### 0.1 Why the voice bridge is a separate Node process

A long-lived bidirectional WebSocket (persistent Deepgram STT/TTS sockets + a streaming LLM) doesn't belong in a Next.js API route, so we split it out:

- **Next.js app** (`next dev`) — UI + the 4 non-realtime agent routes (Overseer, Summary, Assessor, Verdict). Request/response with streaming, which route handlers do fine.
- **Node WS server** (`voice-server/`, a second local process) — the realtime voice bridge + the live Candidate agent. Imports the shared `lib/` (model router, redis, types, prompts).
- **Upstash Redis** — shared session state between the two.

**We are NOT deploying this hackathon** — both run locally (Next on `:3000`, voice server on `:8080`), so there's no `wss://` / mixed-content / serverless concern: `ws://localhost` just works and mic capture is allowed on `localhost`. *Forward-looking note only: if you ever deploy, Vercel serverless can't hold a WebSocket — the voice server would need a Node host (Railway/Render/Fly) and the browser would need `wss://`.*

### 0.2 Implementation Status — what's actually built (as of `12b6e36 add feedback (lowkey mvp)`)

The team has wired a **real, text-based MVP of the full loop** — three live Claude agents — ahead of voice and the multi-agent verdict. That's the "strict MVP first" path (§10), just in **text before voice**. Treat this as the safety-net/fallback loop to build voice on top of.

| Piece | Status | File | Notes |
|---|---|---|---|
| Candidate generation | ✅ real Claude | `app/api/generate-candidates/route.ts` | `claude-sonnet-4-6`, **forced tool-use** (`create_candidates`). **5** candidates, fixed distribution (1 strong / 2 adequate / 1 deceptive / 1 underqualified). |
| Text interview (candidate roleplay) | ✅ real Claude | `app/api/interview/route.ts` | `claude-sonnet-4-6`. System prompt shaped by `qualityTier` + `redFlags`/`greenFlags`. **Text chat, not voice.** |
| **Feedback report** *(the new commit)* | ✅ real Claude | `app/api/generate-feedback/route.ts` | `claude-sonnet-4-6`, forced tool-use (`generate_feedback`) → `FeedbackReport` { overallScore, whatWentWell[], areasForImprovement[], correctHire, userPickedCorrectly, keyMoments[] }. Sees all transcripts + notes + hidden tiers/flags; "correct hire" = the `strong` candidate. |
| State | ⚠️ **localStorage**, not Redis | client pages | `interviewiq_candidates`, `interviewiq_job`, `interviewiq_messages_{id}`, `interviewiq_notes_{id}`, `interviewiq_feedback`. `lib/redis.ts` + `save-notes` exist but are unused/no-op. |
| Structured output | **forced tool-use** | all 3 routes | `tool_choice:{type:'tool'}` + read `tool_use.input`. Valid alternative to `messages.parse`/`output_config` — **treat tool-use as the repo's structured-output convention** (§6/§8). |

**How the built feedback maps to the plan:** today's `generate-feedback` is an **MVP of the Final Verdict (§7.5)** — a single end-of-session report that already does correct-hire + was-the-user-right + key moments. It is **not yet** the planned multi-stage flow: no per-interview **Summary** (§7.3), no **Fit Assessor** (§7.4), and the verdict isn't streamed, isn't opinionated/willing-to-disagree, and lacks the resume-vs-reality + timestamped-coaching richness (§8 `FinalVerdict`).

**Deltas from the target plan (decisions as you build forward):**
- **🔒 Truthfulness is client-exposed today.** The full `Candidate` (incl. `qualityTier`/`redFlags`/`greenFlags`) lives in localStorage and is POSTed back to `generate-feedback` — so the "hidden" info isn't actually hidden. Fix = the server-side split (§4.1 `CandidateRecord` vs `CandidatePublic`), which requires moving state localStorage → Redis.
- **5 candidates + hardcoded distribution** vs `NUM_CANDIDATES=3` + per-call tier assignment (§7.1).
- **`claude-sonnet-4-6` hardcoded in every route** vs the `model_router.ts` switcher (§6); no OpenAI path yet.
- **Text interview** vs the voice pipeline (§3); voice + the Node WS server are still greenfield.
- Template framing still present: model = `qualityTier` (strong/adequate/poor) + red/green flags, **not yet** `truthfulness` (honest/mixed/embellished) + resume-vs-reality.
- Reuse, don't rewrite: port the working tool-use + prompt patterns from these three routes into `lib/agents/*` behind the router as you migrate.

---

## 1. Product Flow (the 7 steps the demo shows)

```
1. Setup        Founder picks model (fast/cheap vs best) + enters job description & company context
2. Overseer     Generates N candidates (default 3): each gets a RESUME (public) + a TRUTHFULNESS
                profile (server-only) + a pre_interview_score. Guaranteed spread: honest / mixed / embellished.
3. Pick + talk  Founder sees resume cards (clean), picks one → VOICE interview. Candidate agent answers
                from the resume but uses the truthfulness profile to know where to be solid vs. hedge/struggle.
4. Summary      Founder ends interview → a 3–5 sentence per-interview summary appears beside the resume.
                (Founder can pick another candidate and repeat 3–4.)
5. Done         Founder clicks "Done interviewing" → Fit Assessor adjusts each post_interview_score (background, hidden).
6. Founder pick Founder is shown resumes + summaries and picks who THEY think is the best fit.
7. Verdict      Final Verdict agent (streamed) reveals the truth: who the best fit actually is, whether the
                founder was right, what they missed/let slide, where resume-vs-reality gaps were (or weren't)
                exposed, and coaching moments with timestamps. It has an opinion and will disagree.  ← money shot
```

**Iron rule:** the **truthfulness profile is server-side only.** It is passed to the Candidate agent's system prompt (on the voice server) and read by the Assessor/Verdict (server). It is **never** sent to the frontend and the Candidate must **never** reveal it aloud. See §11.

---

## 2. Tech Stack (final)

| Layer | Choice | Notes |
|---|---|---|
| App + non-realtime agents | **Next.js 14 App Router (TS)** — local `next dev` | Existing template. shadcn/ui + Tailwind. API routes = Overseer, Summary, Assessor, Verdict. |
| Voice bridge + live Candidate | **Node WS server (TS)**, `ws` + `@deepgram/sdk` — separate local process | `voice-server/`. Imports `lib/`. Holds the Deepgram STT/TTS sockets + the streaming Candidate LLM. |
| State | **Upstash Redis** (`@upstash/redis`, installed) | Shared by Vercel routes + the Node server. 24h TTL. Replaces the plan's old in-memory dict — **the single-worker risk is gone.** |
| LLMs | **`model_router.ts`** over **OpenAI** (`gpt-4o-mini`, cheap mode) + **Anthropic** (`claude-opus-4-8` / `claude-sonnet-4-6` / `claude-haiku-4-5`, best mode) | Both stream. One provider per session. Add `openai` to deps. |
| STT | **Deepgram nova-3** live (`client.listen.v1.connect`) | `@deepgram/sdk` v5.4 (installed). |
| TTS | **Deepgram Aura-2** streaming (live `speak`) | Same SDK. Token-by-token, sub-300ms server TTFB. Official Node TTS-WS starter exists to copy. |
| Errors | **Sentry** — `@sentry/nextjs` **already wired** | Add Sentry Node init to `voice-server/` too. |
| Tracing (bonus) | OpenTelemetry/Arize stub present (`lib/tracing.ts`) | Optional agent-trace observability; not required. |

**Model IDs** (verified): `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5` (bare aliases — no date suffix), and `gpt-4o-mini`. **Deepgram JS SDK v5 surface** (verified): live STT `client.listen.v1.connect({model:"nova-3", interim_results:"true", …})`; live TTS via `client.speak.*`. **Watch:** v5 changed the API from v3/v4 — old blog examples use `listen.live(...)`; copy from the v5 README, not stale tutorials.

---

## 3. Architecture — The Manual Voice Pipeline (Node WS server)

> 🔀 **The `voice-interview` branch does NOT use this. It uses a simpler browser-direct approach — see §17.** §3 stays the design of record for a future server-orchestrated / deployed version.

> **All §3 sub-sections are preserved from the reviewed plan; only the runtime (Node, `@deepgram/sdk`, `AbortController`) and the agent inputs (resume + truthfulness instead of a static persona) changed.**

### 3.1 Data flow

```
 Browser (Next.js, local)                     Node voice server (local process)
 ┌───────────────┐  wss (voice server)  ┌────────────┐   ┌──────────────┐
 │ Mic (Worklet) │═══ binary PCM 16k ═══▶│  ws        │══▶│ Deepgram STT │ nova-3
 │               │                       │  handler   │   └──────────────┘
 │ Audio player  │◀══ binary PCM 24k ════│ (per       │◀── transcript + word timings
 │ (24k queue)   │                       │  interview)│         │ on latched turn-end
 │ LiveTranscript│◀══ JSON events ═══════│            │         ▼
 └───────────────┘                       │            │   model_router.streamText(provider)
                                          │            │   system = resume + TRUTHFULNESS
                                          │            │         │ tokens (per clause)
                                          │            │         ▼
                                          │            │══▶┌──────────┐
                                          │            │◀──│ Aura TTS │ (Speak+Flush)
                                          └─────┬──────┘   └──────────┘
                                                │ writes transcript + timing
                                                ▼
                                        Upstash Redis  session:{id}
                                                ▲
 Next.js API routes (local) ────────────────────┘  (Overseer / Summary / Assessor / Verdict read+write)
```

The voice server loads the **full** candidate record (incl. truthfulness) from Redis by `session_id`+`candidate_id`, runs the realtime loop, and writes `transcript` + `timing` back to Redis under that candidate. It never sends truthfulness to the browser.

### 3.2 One WS per interview
`wss://<voice-server>/ws/interview?session_id=…&candidate_id=…`. Browser sends mic audio up (binary) + control JSON; receives transcript events (JSON) + candidate TTS audio (binary). Inside that connection the server opens the two Deepgram sockets (STT, TTS) and runs the model-router stream.

### 3.3 Turn-taking, Flush, barge-in (unchanged design)

Open STT with: `model=nova-3, encoding=linear16, sample_rate=16000, channels=1, interim_results=true, punctuate=true, smart_format=true, endpointing=300, utterance_end_ms=1000, vad_events=true`.

- **Turn-end + latch:** fire the candidate reply on `speech_final`; treat `UtteranceEnd` as a fallback only if no `speech_final` came; **latch per turn** so the two don't double-fire. Never use bare `SpeechStarted` as a turn signal.
- **Flush-per-clause:** chunk the LLM stream on clause boundaries → `Speak` + `Flush` per clause to Aura, don't wait for the full reply (else TTFB balloons).
- **Echo / self-interruption (the #1 laptop failure):** `getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true } })` **and** gate mic→STT while the candidate is speaking.
- **Barge-in (stretch, time-boxed):** only on a real interim transcript with ≥N words; send `{type:"stop_playback"}` + `{type:"candidate_speaking_end"}`, then **`AbortController.abort()`** the in-flight model-router stream and close/stop the Aura send. (Node's equivalent of `asyncio` task cancellation — the router takes an `AbortSignal`.)

### 3.4 Audio formats

| Direction | Format | Notes |
|---|---|---|
| Mic → server → STT | linear16 PCM, 16 kHz, mono | **Don't assume 48 kHz.** Simplest: create the capture `AudioContext({ sampleRate: 16000 })` and let the browser resample; the worklet only does Float32→Int16. Fallback: `MediaRecorder` webm/opus (Deepgram decodes it). |
| Aura → server → browser | linear16 PCM, 24 kHz, mono | Forward Aura **binary** frames; filter out Aura's **JSON** frames (`Metadata`/`Flushed`/`Warning`) server-side. Playback: normal `AudioContext`, build each `AudioBuffer` at `sampleRate:24000`, schedule `nextStart = max(ctx.currentTime, nextStart); src.start(nextStart); nextStart += buf.duration`. |

> **Latency budget:** ~1–2 s typical, up to ~3 s in a noisy room (turn-end floored by `utterance_end_ms`). Show a "your turn / thinking…" indicator. Keep candidate `maxTokens` ~384.

### 3.5 Timing & metrics — one clock, code-computed
Backend **monotonic** clock (`performance.now()`) is the source of truth. Interviewer turn boundaries stamped when the server receives `speech_final`/`UtteranceEnd`. Candidate spans from Aura bytes: **seconds = bytes / (24000 × 2 × 1)**; on barge-in count only bytes sent before `stop_playback`. These feed the Verdict's "coaching moments with timestamps." (Talk-ratio is available if useful, but the product's payload is now resume-vs-reality + decision quality, not bias/talk metrics.)

---

## 4. API Contract & Session State (freeze in Hour 1)

> **Wire format is snake_case or camelCase — pick one and keep it; the template uses camelCase TS, so stay camelCase end-to-end.** Any change to a shared type edits `types/index.ts` once (both Vercel routes and the Node server import it).

### 4.1 Session state (Redis, `types/index.ts`)

Replaces the template's `InterviewSession`/`Candidate`. **Split public vs server-only.**

```ts
type Provider = 'openai' | 'anthropic'
type Truthfulness = 'honest' | 'mixed' | 'embellished'

interface CandidateRecord {            // SERVER-SIDE shape (lives in Redis)
  id: string
  resume: Resume                       // reuse existing Resume type → PUBLIC
  displayName: string; role: string; yearsExperience: number; voice: string  // public card fields
  truthfulness: { overall: Truthfulness; notes: string }   // 🔒 SERVER-ONLY — never serialized to client
  preInterviewScore: number            // 0–100, Overseer
  transcript: TranscriptEntry[]        // written by voice server
  timing?: TimingSummary
  summary?: string                     // Per-Interview Summary
  postInterviewScore?: number          // Fit Assessor
  interviewed: boolean
}
interface CandidatePublic {            // exactly what the frontend receives — toPublic(rec) strips truthfulness + scores
  id: string; displayName: string; role: string; yearsExperience: number
  resume: Resume; summary?: string; interviewed: boolean
}
interface Session {
  sessionId: string
  jobTitle: string; jobDescription: string; companyContext: string
  modelProvider: Provider              // set at start, immutable
  candidates: CandidateRecord[]
  currentInterview?: { candidateId: string; startedAt: number }
  doneInterviewing?: boolean
  founderPick?: string                 // candidateId
  finalVerdict?: FinalVerdict
}
interface TranscriptEntry { utteranceId: string; role: 'interviewer'|'candidate'; text: string; ts: number }
```

`lib/session.ts` already mints a client UUID in localStorage; `lib/redis.ts` already has `getSession`/`saveSession` (currently typed to the old shape — **retype to `Session`**). **Add a `toPublic(rec): CandidatePublic` mapper and route every client-facing payload through it.**

### 4.2 REST (Next.js routes, Vercel)

| Method | Path | Body / Returns |
|---|---|---|
| `POST` | `/api/sessions` | `{ jobTitle, jobDescription, companyContext, modelProvider }` → runs **Overseer** (blocking, streamed loading) → `{ sessionId, candidates: CandidatePublic[] }` |
| `GET` | `/api/sessions/{id}/candidates` | `CandidatePublic[]` — **truthfulness stripped** |
| `POST` | `/api/sessions/{id}/interviews` | `{ candidateId }` → sets `currentInterview`, returns `{ wsUrl }` (the voice-server URL with query params). The browser then opens the WS. |
| `POST` | `/api/sessions/{id}/interviews/{candidateId}/end` | (after the WS closed & transcript persisted) runs **Per-Interview Summary**, stores it, returns `{ summary }` |
| `POST` | `/api/sessions/{id}/done` | triggers **Fit Assessor** (background; returns `{ ok:true }` immediately) |
| `POST` | `/api/sessions/{id}/pick` | `{ candidateId }` → stores `founderPick`, triggers **Final Verdict** |
| `GET` | `/api/sessions/{id}/verdict` | streams (SSE/ReadableStream) or polls the `FinalVerdict` |
| `GET` | `/healthz` | `{ ok:true }` |

### 4.3 WebSocket (Node voice server, Railway): `/ws/interview?session_id&candidate_id`

Identical message contract to the reviewed plan (binary = audio, JSON = control):
- **Client→Server:** binary mic frames (dropped until `session_started`); `{type:"start"}`; `{type:"end"}`.
- **Server→Client:** binary TTS frames (only between `candidate_speaking_start`/`_end`); JSON `session_started` | `transcript{utteranceId,role,text,isFinal,ts}` | `candidate_speaking_start` | `candidate_speaking_end` | `stop_playback` | `observer_flag` *(stretch)* | `error{fatal,message}`. On `end`, the server persists `transcript`+`timing` to Redis and closes; the browser then calls the REST `…/end` to get the summary.

**Ownership seam:** `types/index.ts` (shared) + this contract. Builder 1 owns `voice-server/`, `lib/`, and `app/api/**`. Evan owns `app/**` pages, components, `lib/audio/*`, `lib/ws.ts`.

---

## 5. Repo / File Structure (build on the template)

**Legend:** ✅ keep · ✏️ refactor · 🆕 new · ❌ retire

```
candid/  (existing Next.js repo, single repo)
├─ app/
│  ├─ page.tsx                         ✏️ add company-context field + MODEL SWITCHER; POST /api/sessions
│  ├─ candidates/page.tsx              ✏️ read CandidatePublic[] from session (NOT PLACEHOLDER_CANDIDATES)
│  ├─ candidates/[id]/resume/page.tsx  ✏️ read from session
│  ├─ candidates/[id]/interview/page.tsx ✏️ VOICE UI (mic, live transcript, playback) — replaces text chat
│  ├─ decision/page.tsx                ✏️ becomes the "Founder Pick" page (step 6)
│  ├─ feedback/page.tsx                ✏️ becomes the "Final Verdict" page (step 7, streamed)
│  ├─ done/page.tsx                    🆕 "Done interviewing" → POST /api/sessions/{id}/done
│  └─ api/
│     ├─ sessions/route.ts                       🆕 POST → Overseer
│     ├─ sessions/[id]/candidates/route.ts       🆕 GET (public)
│     ├─ sessions/[id]/interviews/route.ts       🆕 POST (start; returns wsUrl)
│     ├─ sessions/[id]/interviews/[cid]/end/route.ts 🆕 POST → Summary
│     ├─ sessions/[id]/done/route.ts             🆕 POST → Fit Assessor
│     ├─ sessions/[id]/pick/route.ts             🆕 POST → Final Verdict
│     ├─ sessions/[id]/verdict/route.ts          🆕 GET (stream/poll)
│     ├─ generate-candidates/route.ts            ❌ replaced by POST /api/sessions
│     ├─ generate-feedback/route.ts              ❌ replaced by verdict route
│     ├─ interview/route.ts                       ✅ keep as optional TEXT fallback (demo safety)
│     └─ save-notes/route.ts                       ✅ optional (founder notes) — wire to Redis or drop
├─ lib/
│  ├─ model_router.ts                  🆕 the OpenAI/Anthropic abstraction (§6)
│  ├─ agents/
│  │  ├─ overseer.ts  summary.ts  assessor.ts  verdict.ts  candidate.ts   🆕 (candidate.ts = prompt builder)
│  ├─ prompts.ts                       🆕 system-prompt builders (§7)
│  ├─ redis.ts                         ✏️ retype to Session; keep get/save
│  ├─ session.ts                       ✅ client session id
│  ├─ anthropic.ts                     ✏️ fold into model_router (or keep as the anthropic adapter)
│  ├─ tracing.ts                       ✅ optional
│  └─ audio/ recorder.ts  player.ts    🆕 (frontend capture@16k / 24k PCM playback)
├─ public/worklets/pcm-recorder.js     🆕 Float32→Int16
├─ types/index.ts                      ✏️ new Session/CandidateRecord/CandidatePublic/FinalVerdict/Summary types
├─ components/ (shadcn ui)             ✅ keep; 🆕 add MicButton, VoiceTranscript, VerdictView, ModelSwitcher
├─ lib/data.ts                         ❌ PLACEHOLDER_CANDIDATES / PLACEHOLDER_FEEDBACK — delete after wiring
├─ sentry.*.config.ts                  ✅ wired
└─ voice-server/                       🆕 Node WS server (Railway)
   ├─ index.ts                         ws server; per-interview loop; Deepgram STT+TTS; imports lib/
   ├─ deepgram.ts                      STT + Aura helpers (filter JSON vs binary, Flush-per-clause)
   └─ package.json / tsconfig          (or share root; run with tsx/node)
```

---

## 6. Model Router (the switcher) — `lib/model_router.ts`

One abstraction; **no provider-specific code in any agent.** Founder's choice is stored as `session.modelProvider` and passed to every call.

```ts
type Role = 'overseer' | 'candidate' | 'summary' | 'assessor' | 'verdict' | 'observer'

const MODELS: Record<Provider, Record<Role, string>> = {
  anthropic: { overseer:'claude-sonnet-4-6', candidate:'claude-sonnet-4-6', summary:'claude-haiku-4-5',
               assessor:'claude-sonnet-4-6', verdict:'claude-opus-4-8', observer:'claude-haiku-4-5' },
  openai:    { overseer:'gpt-4o-mini', candidate:'gpt-4o-mini', summary:'gpt-4o-mini',
               assessor:'gpt-4o-mini', verdict:'gpt-4o-mini', observer:'gpt-4o-mini' },
}

interface GenOpts { role: Role; provider: Provider; system: string; messages: Msg[]
                    maxTokens?: number; signal?: AbortSignal }
// Streaming text (candidate, verdict): yields text deltas, accepts AbortSignal
async function* streamText(o: GenOpts): AsyncIterable<string>
// Structured JSON (overseer, summary, assessor, verdict): returns a validated object
async function generateJSON<T>(o: GenOpts & { schema: ZodType<T> }): Promise<T>
```

- **Anthropic adapter:** `messages.stream(...)` for text; structured via `messages.parse({ output_config:{ format: zodOutputFormat(schema) } })` (or tool-use). `maxTokens`, `thinking` per role (candidate + overseer: thinking off / effort low for speed; verdict: thinking adaptive).
- **OpenAI adapter:** `chat.completions.create({ stream:true })` for text; structured via `chat.completions.parse({ response_format: zodResponseFormat(schema, name) })`. gpt-4o-mini everywhere.
- **Both stream.** Normalize the two delta shapes inside the router so agents see one async iterator. Use **Zod** as the single schema source → both `zodOutputFormat` (Anthropic) and `zodResponseFormat` (OpenAI) derive from it; the structured-output rules (`additionalProperties:false`, all-required, enums, nullable for optional) are handled by those helpers.
- Verify exact method names against the **installed** SDK versions (`@anthropic-ai/sdk` 0.105; add latest `openai`) — write the adapter and let the compiler guide you.

---

## 7. Agents & Prompts

Five agents, all via the router. (Observer = stretch.)

### 7.1 Overseer (Step 2 — runs once, founder waits)   🔲 *pending — today's `generate-candidates` (5 candidates, public flags) is the precursor*
Input: job title/description + company context + `NUM_CANDIDATES`. **Generate the N candidates in parallel** (one `generateJSON` call per candidate, `Promise.all`) and **assign the truthfulness tier per call** so the spread is guaranteed AND latency ≈ one candidate (founder waits less): tiers cycle `['honest','embellished','mixed', …]` across N. Each call returns one `{ resume, displayName, role, yearsExperience, truthfulness:{overall,notes}, preInterviewScore }`. Assign an Aura voice per candidate from a small pool. Store full records (incl. truthfulness) in Redis; return only `toPublic(...)`.

System prompt (per-candidate): *"You generate ONE realistic job candidate for the role below. You are assigned truthfulness tier = {tier}. Produce (a) a polished RESUME a real applicant would submit, and (b) a private TRUTHFULNESS profile for the interviewer's simulator. honest → resume matches reality, can answer deeply. embellished → resume inflates scope/ownership; they can describe the work but crack under architectural/decision depth; name exactly where. mixed → some sections solid, some shaky; specify which. Also score paper-fit to the job (pre_interview_score 0–100). The resume must NOT hint at the truthfulness tier."*

### 7.2 Candidate (Step 3 — voice, streaming, on the voice server)   ✅ *text + voice built (voice = browser raw-WS on the `voice-interview` branch, §17); persona still uses the existing qualityTier/flags — the truthfulness-profile split is pending*
Settings: thinking off, effort low, `maxTokens≈384`, stream → Aura. System prompt = **resume (identity) + truthfulness profile (behavior)**:

```
You are {displayName}, interviewing for {role}. You are a person, not an assistant. Stay in character;
never mention being an AI; NEVER reveal, hint at, or describe your truthfulness profile or that you are
"supposed to" struggle anywhere.

YOUR RESUME (this is who you publicly claim to be — answer consistently with it):
{resume as text}

PRIVATE TRUTHFULNESS GUIDANCE (shapes HOW you answer — never state it):
- Overall: {truthfulness.overall}
- {truthfulness.notes}
Where you are solid → answer with specific, confident detail. Where you embellished → you can describe
the surface but get vague, deflect, or hedge under follow-ups about decisions/architecture/tradeoffs;
show mild discomfort, don't volunteer that you're unsure why.

Spoken aloud: 1–3 sentences usually, natural fillers sparingly, no markdown. React to interviewer tone
(warm → open up; cold/rushed → guarded). Respond only as {displayName}.
```

### 7.3 Per-Interview Summary (Step 4 — light, after each interview)
Input: candidate resume + truthfulness + this interview's transcript. Output: a 3–5 sentence read of how it went (engagement, where they were strong, where they got shaky, notable moments). `summary: string` (+ optional `signalFlags: string[]`). Cheap/fast model role.

### 7.4 Fit Assessor (Step 5 — background, after all interviews)
Input: all candidates' profiles + summaries + pre_interview_scores + transcripts. Output per candidate: `{ candidateId, postInterviewScore, rationale }` — a *slight* adjustment of the pre-score given how the interview actually went. **Not shown to the founder.**

### 7.5 Final Verdict (Step 7 — streamed, the money shot)   ✅ *MVP built as `/api/generate-feedback` (single report); needs streaming + opinion/disagreement + resume-vs-reality + timestamps*
Input: everything — resumes, **truthfulness profiles**, transcripts, pre/post scores, the founder's pick. Streamed for the reveal. System prompt: *"You are a blunt, experienced hiring advisor talking to a founder (not HR). You have the ground truth the founder never saw. Say who the best fit actually is and why; state plainly whether the founder's pick was right or wrong; call out what they missed, let slide, or misjudged across interviews; identify where resume-vs-reality gaps were exposed or slipped through; cite specific moments with timestamps. Have a real opinion and disagree with the founder when the evidence warrants — never just validate the choice. Plain language, direct, founder-to-founder."* Output schema in §8.

### 7.6 Observer (stretch — live, on the voice server)
Fire-and-forget per finalized interviewer turn (`AbortController`, swallow errors, never block the reply). Reframed to the product: live chips like *"claim under test"* / *"candidate hedging"*. Cheap model. Counts against quota — consider video-only.

---

## 8. Schemas (Zod → both providers)

Defined once as Zod in `types/index.ts`; the router derives Anthropic + OpenAI structured formats from them. Keep enums; mark optional fields nullable; no min/max in schema (express ranges in the prompt — the SDK helpers handle the rest).

```ts
// Overseer (per candidate)
CandidateGen = { resume: Resume, displayName, role, yearsExperience:int,
                 truthfulness:{ overall:'honest'|'mixed'|'embellished', notes:string },
                 preInterviewScore:int /*0–100*/ }

// Per-Interview Summary
InterviewSummary = { summary:string, signalFlags:string[] }

// Fit Assessor (per candidate)
FitAssessment = { candidateId:string, postInterviewScore:int, rationale:string }

// Final Verdict (money shot)
FinalVerdict = {
  bestFitCandidateId: string,
  founderWasRight: boolean,
  verdictSummary: string,                       // direct, founder-facing
  whatFounderMissed: string[],                  // let slide / misjudged
  resumeVsReality: { candidateId, claim, reality, exposedInInterview:boolean }[],
  coachingMoments: { candidateId, ts:number, quote:string, commentary:string }[],
}
```

---

## 9. Multi-Agent Story (Anthropic angle)
Five role-specialized agents (Overseer, Candidate, Summary, Assessor, Verdict) + a live Observer (stretch), all behind one provider-switchable router. In **best-quality mode** that's a genuine multi-model Claude system (`opus-4-8` for the verdict, `sonnet-4-6` for generation + the live candidate, `haiku-4-5` for summaries). Strong "built with Claude" + economic-opportunity (better hiring) story. **Demo the verdict in best/Claude mode** (see §11).

---

## 10. Hour-by-Hour Plan (24h, 2 builders)

**Builder 1:** `voice-server/` (Node WS + Deepgram + live Candidate), `lib/model_router.ts`, `lib/agents/*`, all `app/api/**` routes, Redis wiring. **Evan:** all `app/**` pages + components (model switcher, candidate cards from session, **voice UI**, summary/pick/verdict pages), `lib/audio/*`, `lib/ws.ts`.

### Hours 0–2 — Setup, contract freeze, connectivity proof (BOTH)
- `npm i openai`; add Sentry init to `voice-server/`. Create the Upstash DB (cloud) and the two local processes (Next `:3000` + voice server `:8080`). Freeze §4 types in `types/index.ts`.
- **5 smoke tests (do not skip):** (1) Node `ws` server (local `:8080`) accepts a browser socket over `ws://localhost` from the `next dev` page; (2) Deepgram `listen.v1.connect` returns live transcripts; (3) Aura live TTS returns audio bytes; (4) one Anthropic **and** one OpenAI stream flow through `model_router.ts`; (5) write+read a `Session` in Upstash. If these pass, no architecture surprises remain.

### Hours 2–6 — Agents + frontend shell (parallel)
- **B1:** `model_router.ts` (both providers, stream + generateJSON). **Overseer** route (parallel per-candidate generation + tier assignment) → real candidates in Redis. `voice-server` skeleton: accept WS, pipe mic→STT→transcript JSON, and **stream a stubbed/text candidate reply** (real Aura next). **Also ship a fake-PCM streamer** so Evan can build playback now.
- **Evan:** landing + **model switcher** + company context → `POST /api/sessions`. Candidate cards from `GET …/candidates`. Voice interview page: mic capture (`recorder.ts` @16k) + transcript render + **`player.ts` hardened against the fake-PCM source** (start the hardest task now).

### Hour 6 — **MVP GATE (enforced): tag `candid-mvp`** (BOTH)
Full thin loop: model+job input → Overseer generates 3 real candidates → founder picks → voice interview (STT + **candidate speaks via real Aura**) → end → **Per-Interview Summary renders beside the resume.** Commit + tag. Only after this do Assessor/Verdict get built.

### Hours 6–10 — Close + deepen the interview loop (BOTH)
- **B1:** real Aura in the voice server (Flush-per-clause, JSON-frame filtering, byte→seconds timing); candidate system prompt = resume + truthfulness; `…/interviews/{cid}/end` → Summary. Echo-cancellation + mic-gating.
- **Evan:** polish voice UX (speaking indicator, turn indicator), summary display, multi-candidate loop (interview a 2nd candidate).

### Hours 10–14 — Assessor + Verdict (the payoff) (BOTH)
- **B1:** `done` route → **Fit Assessor** (background). `pick` route → **Final Verdict** (streamed, §7.5/§8). Verify the verdict actually disagrees on a planted case (founder picks the embellished candidate → verdict pushes back).
- **Evan:** "Done interviewing" page, **Founder Pick** page (resumes + summaries), **Verdict** page (streamed reveal UI — the demo's climax).

### Hours 14–15 — **Reserved buffer** (absorbs voice-loop overrun)
Pre-authorized fallback: if linear16 capture isn't flowing by ~hour 7, switch to `MediaRecorder`/webm. If voice is shaky by hour 14, the **text interview fallback** (`/api/interview`) keeps the full loop demoable.

### Hours 15–17 — Stretch (ranked): 2nd+3rd candidate polish · barge-in (optional, throwaway branch) · Observer chips · extra personas/voices.

### Hours 17–20 — Sleep (staggered).

### Hours 20–23 — Polish + submission draft. **Record the backup video the moment the first full run-through passes.** README + diagram. Devpost draft by midnight.

### Hours 23–24 — Submit + rehearse the 4-min demo (§12) + the failure-recovery path (§16).

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **🔒 Truthfulness leaks to the client** *(LIVE TODAY — see §0.2: full candidates incl. hidden flags sit in localStorage and are POSTed to `generate-feedback`)* | Route every client payload through `toPublic()`; never include `truthfulness`/scores in `/candidates` or WS messages. Move state localStorage → Redis so hidden fields never reach the browser. The Candidate prompt forbids revealing it aloud. Add a test asserting `/candidates` JSON contains no `truthfulness`/`notes`/`preInterviewScore`. |
| **Not deploying (hackathon)** | Both run locally (Next `:3000`, voice server `:8080`, `ws://localhost`) — no TLS/mixed-content concern. If you deploy later, Vercel can't host the WS — voice needs a Node host + `wss://`. |
| **Candidate breaks character / over-hedges / under-hedges** | Tight §7.2 prompt (answer from resume, hedge only where truthfulness says). Test all three tiers early; tune wording. |
| **Overseer latency (founder waiting)** | Overseer = `claude-sonnet-4-6` (opus-4-8 was too slow); generate N candidates **in parallel**; stream a loading state. |
| **model_router parity** | Anthropic vs OpenAI deltas + structured-output APIs differ — normalize in the router; both must stream; derive both formats from one Zod schema. Smoke-test both in hour 0–2. |
| **gpt-4o-mini weakens the money shot** | Cheap mode is a cost/latency option, not the demo path. **Demo the Verdict (and Overseer) in best/Claude mode.** Note this in the demo checklist. |
| **Cross-service Redis drift** | Single `Session` type in `types/index.ts` imported by both; both services get the Upstash env vars; serialize/deserialize identically. |
| **Voice realism / audio glitches** | §3 details: capture@16k, 24k playback with `nextStart` scheduling, echo cancellation, mic-gating, latch, Flush-per-clause. Evan hardens playback vs the fake-PCM source early. |
| **Verdict call hangs** | Stream it (no long non-streaming call); client-side timeout + graceful fallback. Rehearse on a full multi-interview session. |
| **Template leftovers ship** | Delete `lib/data.ts` placeholders after wiring; replace "InterviewIQ" naming; candidate pages must read the session, not `PLACEHOLDER_CANDIDATES`. |
| **Quota mid-demo** (Deepgram both directions + Anthropic **and** OpenAI) | §16: confirm balances/limits, budget audio-minutes, single-active-session gate, mandatory backup video. |
| **Mid-call failure → dead air** | §16 error handling: LLM error/refusal → fallback line + `candidate_speaking_end`; Deepgram socket drop → reconnect-or-keep-session; never silent. |

---

## 12. Demo Script (4 min, draft)

1. **(20s) Hook + setup:** "Founders are bad interviewers and can't spot embellishment." Pick **Best (Claude)** mode, enter a real job + company.
2. **(20s) Overseer:** 3 resume cards appear (loading → done). They all look hireable on paper.
3. **(90s) Voice interview:** pick the **impressive-looking but embellished** candidate; ask a soft question (they shine), then a **depth question** about a headline claim — watch them hedge/deflect in a natural voice, live transcript. End → the per-interview summary captures it.
4. **(20s)** Quickly interview the honest candidate (they answer with real depth). Click **Done interviewing**.
5. **(20s) Founder pick:** deliberately pick the embellished one (the "trap").
6. **(70s) Verdict reveal (streamed):** it **disagrees** — names the honest candidate as the real best fit, shows where the embellished resume's claims fell apart in the transcript (with timestamps), and tells the founder what they let slide.
7. **(20s) Close:** "A flight simulator for hiring — multi-agent Claude system + a real-time Deepgram voice pipeline."

---

## 13. Prize Checklist
- **Sentry** — ✅ already wired (`@sentry/nextjs` + 3 configs). Add Node init to `voice-server/`. Submit.
- **Deepgram** — core (nova-3 + Aura, JS SDK v5). Confirm credits + concurrency. Attend the Saturday workshop.
- **Anthropic** — multi-agent Claude system (best mode); better-hiring / economic-opportunity angle. Demo in Claude mode.
- **Band** — only if core done before midnight.
- **Hume** — only if Band done.

---

## 14. Windows / Local Dev Notes
- **Two processes:** `npm run dev` (Next.js) + a separate `npm run voice` (e.g. `tsx voice-server/index.ts`). No `uvicorn`/Python anywhere.
- **No blocking CPU work** on the Node main thread — the workload is I/O-bound (Deepgram + LLM); audio is forwarded, not DSP'd.
- Cancellation uses **`AbortController`/`AbortSignal`** (threaded into the router + Aura send), not `asyncio`.
- Env via Next.js env + `.env.local`; the voice server reads `process.env` (dotenv if run standalone).
- Mic needs a **secure context**: `localhost` is a secure context, so `ws://localhost` to the voice server works with no TLS for local dev. Test mic permission in the exact demo browser/laptop.
- **Capture** `AudioContext({sampleRate:16000})`; **playback** normal context with 24k `AudioBuffer`s.
- **Deepgram JS SDK v5** API differs from old tutorials — use `listen.v1.connect` / current `speak`, copy from the v5 README.
- Test **both** Deepgram sockets + **both** LLM providers + Upstash in hours 0–2.

---

## 15. Environment Variables

**`.env.local` (Next.js)** and **`voice-server` env** — both need the LLM + Deepgram + Redis keys:
```
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...                 # NEW — model switcher
DEEPGRAM_API_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
SENTRY_DSN=...                     # + NEXT_PUBLIC_SENTRY_DSN for the client
NUM_CANDIDATES=3                   # configurable candidate count
```
**Frontend public:**
```
NEXT_PUBLIC_VOICE_WS_URL=ws://localhost:8080   # the local Node WS server (wss://… only if deployed)
NEXT_PUBLIC_API_URL=                # usually same-origin (Vercel)
```

---

## 16. Demo-Day Operations
- **Quota budget (before the event):** Deepgram bills STT **and** TTS minutes (≈3 min/90s call) — budget 5 rehearsals + judging + warm-up; confirm credits + concurrency. Confirm **both** Anthropic (RPM/ITPM/OTPM) **and** OpenAI limits. **Demo in best/Claude mode.**
- **Single-active-session gate:** reject/queue new interview WS connections while one is live (don't let an expo passerby steal Deepgram concurrency).
- **Mid-call error handling:** LLM 5xx/refusal → SDK retry then a canned fallback line + `candidate_speaking_end` (never dead air); Deepgram socket close → one reconnect then keep the session alive so the interview still ends + summarizes; browser disconnect → session persists in Redis.
- **Backup video — mandatory.** Record a clean full run (Overseer → embellished interview → verdict disagreeing) the moment the build is first stable (~hour 21).
- **Pre-judging checklist:** both local processes up (`next dev` + voice server) + a warm-up run done today; Deepgram + Anthropic + OpenAI quota checked; mic permission granted in the exact browser/tab; backup video queued; **model set to Best/Claude**; rehearsed cut-to-video + fast restart.

---

## 17. Voice Interview — AS BUILT (`voice-interview` branch)

> **Status: implemented, typecheck-clean, runtime-verified** (local, uncommitted). It diverged from the original plan in two ways the review forced: (1) **raw browser WebSockets** for STT/TTS, not the `@deepgram/sdk` high-level sockets (the v5 SDK is browser-hostile — see §17.2); (2) **`Sec-WebSocket-Protocol` subprotocol auth with the `bearer` scheme**, not an HTTP header. This section is the as-built record.

**What it does (met):** the AI candidate speaks its replies and **stops the moment the interviewer's voice crosses a tunable volume threshold**, then listens and replies again. **Start / Pause / Resume** without losing the chat. **End Interview** marks the candidate completed and attaches a jot-note summary. Everything downstream is unchanged — the transcript stays `Message[]` in localStorage and `/api/interview` + `/api/generate-feedback` are untouched.

**Decisions (locked):** browser-direct Deepgram (no Node WS server, no deploy — supersedes §3 for this branch); the LLM stays in the existing **`/api/interview`** route; barge-in is a **client-side volume threshold**; designed for **open speakers** (echo cancellation + sustained-threshold debounce) so it also works with headphones (cleanest).

### 17.1 Flow

```
 ┌─ Start interview (user gesture → resume AudioContext, mint token) ─┐
 │                                                                    │
 │  mic (always open) ──▶ Deepgram live STT (browser WS, accessToken) │
 │        │                     │ interim → live captions             │
 │        │                     │ speech_final / UtteranceEnd = turn end
 │        │                     ▼                                     │
 │        │            POST /api/interview {candidate, messages, newMessage}  ◀── UNCHANGED
 │        │                     │ reply text                          │
 │        │                     ▼                                     │
 │        │            Aura streaming TTS (browser WS) ──▶ play (24k PCM queue)
 │        │                     ▲                                     │
 │        └── AnalyserNode RMS ──┘  while speaking: RMS > threshold for N ms
 │                                  → STOP playback + abort → back to listening
 └────────────────────────────────────────────────────────────────────┘
   Every finalized user turn + every reply → Message[] in localStorage  → feedback unchanged
```

### 17.2 Auth + why raw WebSockets (the key learning)
**Token route** `app/api/deepgram-token/route.ts` (server): `await dg.auth.v1.tokens.grant({ ttl_seconds: 30 })` → `{ access_token, expires_in }` via `new DeepgramClient({ apiKey: DEEPGRAM_API_KEY })`. The long-lived key never reaches the browser; a fresh 30s token is minted on every start/resume (it's only needed to open the sockets).

**Browser auth is via subprotocol, not a header:** STT/TTS connect with `new WebSocket(url, [DG_AUTH_SCHEME, accessToken])` (the `Sec-WebSocket-Protocol` pair). `DG_AUTH_SCHEME` lives in `lib/voice/config.ts` and is **`'bearer'`** — runtime-confirmed: a granted token is a JWT and needs `bearer` (Deepgram's docs only show `token`, which is for raw API keys). That one constant is the flip if auth ever fails.

**Why raw `WebSocket` and not the `@deepgram/sdk` v5 sockets** (3 browser blockers, verified in the SDK source during review): (1) the SDK sends auth as an HTTP `Authorization` header, which browsers silently drop on `new WebSocket`; (2) it `JSON.parse`s *every* incoming frame, so Aura's binary PCM throws inside the SDK before reaching us; (3) `client.*.connect()` already opens the socket, so an extra `socket.connect()` re-registers handlers → every event fires twice. STT/TTS therefore use raw `WebSocket`; the SDK is used only server-side in the token route.

### 17.3 State machine + Start / Pause / Resume (`lib/voice/useVoiceInterview.ts`)
`idle → connecting → listening → thinking → speaking → listening` (loop), plus **`paused`**. Mic + `AnalyserNode` run continuously while live.
- **Start** (empty transcript): mint token → `AudioContext` (resumed synchronously inside the click, before any await, for autoplay) → mic + raw STT + raw TTS → speak the greeting.
- **Pause:** tears down mic/STT/TTS/AudioContext but **keeps the transcript**; status → `paused` (the button reads "Resume interview").
- **Resume** (and re-entering with an existing transcript): `start()` skips the greeting when messages exist and just re-listens — full history is re-sent to `/api/interview`, so context is preserved. **No reset, ever.** The transcript is also loaded from localStorage on mount, so navigating away/back never wipes it.
- **Turn end:** Deepgram `speech_final`/`UtteranceEnd` while `listening` → commit the user turn → `thinking`.
- **Safeguards:** a session counter invalidates in-flight async across start/pause/stop (no setState-after-teardown); a 15s watchdog + `onError`→listening prevents a stuck `speaking` state (empty/failed reply); the `/api/interview` fetch has a 30s timeout.

### 17.4 Volume barge-in + echo handling
- `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`.
- `AnalyserNode` (`getFloatTimeDomainData` → RMS) sampled per animation frame (the UI meter is throttled to ~10 fps).
- **Trigger = RMS above `THRESHOLD` for `DEBOUNCE_MS` continuously** while `speaking` → `tts.stop()` → `listening`; the interrupting speech is captured by the still-live STT and becomes the next turn.
- **Off-state speech is discarded:** STT finals accumulate **only while `listening`**, and pending text is cleared on every entry to `listening` — so echo / talk-over during `speaking`/`thinking` can't bleed into the next turn.
- Open speakers: echo cancellation + a threshold above the echo floor + the debounce. **Headphones eliminate it.** Knobs in `lib/voice/config.ts` (`THRESHOLD`, `DEBOUNCE_MS`, `PLAYBACK_LEAD_S`, `DG_AUTH_SCHEME`) + a live threshold slider (min clamped to 0.01 so `0`/always-on can't be selected).

### 17.5 STT — raw browser WebSocket (`lib/voice/stt.ts`)
`new WebSocket('wss://api.deepgram.com/v1/listen?' + params, [DG_AUTH_SCHEME, token])` with `model=nova-3, interim_results=true, smart_format=true, punctuate=true, endpointing=300, utterance_end_ms=1000, vad_events=true` (booleans serialized as the string `'true'`). Mic audio is sent as `MediaRecorder` webm/opus chunks (~250 ms) via `ws.send(blob)` — no `encoding`/`sample_rate` (Deepgram auto-detects the container). Incoming JSON frames: `Results` (interim/final via `channel.alternatives[0].transcript`), `UtteranceEnd`/`speech_final` (turn end), `SpeechStarted`.

### 17.6 TTS — raw browser WebSocket (`lib/voice/tts.ts`)
`new WebSocket('wss://api.deepgram.com/v1/speak?' + params, [DG_AUTH_SCHEME, token])` with `model=aura-2-thalia-en, encoding=linear16, sample_rate=24000`, `binaryType='arraybuffer'`. Per reply: `send({type:'Speak', text})` then `send({type:'Flush'})`. Binary frames = linear16 PCM → Int16→Float32 → 24 kHz `AudioBuffer`s scheduled gaplessly (`nextStart` + `PLAYBACK_LEAD_S` jitter headroom). **End-of-reply is gated on the `Flushed` control frame AND the queue draining**, so streaming gaps don't flip the state machine mid-reply. `stop()` bumps a generation counter, sends `{type:'Clear'}`, and stops queued sources (barge-in).

### 17.7 LLM — unchanged
`POST /api/interview {candidate, messages, newMessage}` → `{reply}`, exactly as today (§0.2). The persona/`qualityTier` system prompt stays server-side — the browser never sees it. *(Optional later: stream `/api/interview` + feed Aura per-token for lower latency; not needed for v1.)*

### 17.8 Transcript & feedback compatibility (hard requirement — verified)
Each user turn → `Message{ role:'user', content, timestamp }`; each reply → `Message{ role:'assistant', ... }`; persisted to `localStorage interviewiq_messages_{id}` **exactly as the text interview**. `/api/interview` and `/api/generate-feedback` are untouched. **localStorage keys (per candidate):** `interviewiq_messages_{id}`, `interviewiq_notes_{id}`, `interviewiq_completed_{id}`, `interviewiq_summary_{id}`.

### 17.9 Files (as built — local on this branch, no commit)
- 🆕 `app/api/deepgram-token/route.ts` — mints the 30s token (server SDK).
- 🆕 `app/api/interview-summary/route.ts` — jot-note summary (`claude-sonnet-4-6`).
- 🆕 `lib/voice/config.ts` — `THRESHOLD`, `DEBOUNCE_MS`, `PLAYBACK_LEAD_S`, models, `DG_AUTH_SCHEME='bearer'`.
- 🆕 `lib/voice/mic.ts` — getUserMedia + AnalyserNode RMS meter + MediaRecorder.
- 🆕 `lib/voice/stt.ts` — raw-WS Deepgram live STT.
- 🆕 `lib/voice/tts.ts` — raw-WS Aura streaming playback + `stop()`.
- 🆕 `lib/voice/useVoiceInterview.ts` — orchestration hook / state machine (Start/Pause/Resume).
- 🆕 `components/summary-notes.tsx` — renders jot-note summaries as bullets.
- ✏️ `app/candidates/[id]/interview/page.tsx` — voice UI (Start/Pause/Resume, status, live caption, meter + slider) + End Interview action.
- ✏️ `app/candidates/page.tsx` · `app/candidates/[id]/resume/page.tsx` · `app/decision/page.tsx` — completed badge + attached summary; Interview button gated.
- env: `DEEPGRAM_API_KEY` (server only). No new npm deps — STT/TTS use the native `WebSocket`; `@deepgram/sdk` is used only in the token route.

### 17.10 End Interview → completed + jot-note summary
On **End Interview** (when ≥1 user turn occurred): tear down voice → set `interviewiq_completed_{id}='true'` → `POST /api/interview-summary` ({candidate, messages} → `claude-sonnet-4-6` → **3–6 jot-note bullets**) → store at `interviewiq_summary_{id}` → navigate to `/candidates`. The completed flag is set *before* the summary call, so the candidate reads as completed even if summary generation fails. The summary prompt is lightly informed by the hidden `qualityTier`/`redFlags` but instructed **not** to reveal them (that's the eventual verdict's job).
- **Candidates list, resume page, decision page:** completed candidates show an "Interviewed" badge + the summary, and the **Interview button is replaced with "Completed"** (also gated on the resume page) — no re-interview option. Summaries render as bullets via the shared `components/summary-notes.tsx`.

### 17.11 Verification & known items
- **`npx tsc --noEmit` clean** after every change on this branch.
- **5-reviewer adversarial pass** caught the 3 SDK browser blockers (§17.2) + logic bugs (echo contamination, stuck-`speaking`, playback overlap) — all fixed.
- **Runtime-confirmed:** `DG_AUTH_SCHEME='bearer'` is required (user-verified); barge-in works on the default threshold.
- **Watch on further testing:** barge-in feel on open speakers (tune `THRESHOLD`/`DEBOUNCE_MS`, or use headphones); a completed candidate cannot be re-interviewed by design (a re-interview escape hatch is a one-line change if wanted).

---

*Assumptions made (flag if any are wrong): no deployment this hackathon — both run locally (Next `:3000` + voice server `:8080`); Overseer = `claude-sonnet-4-6` (opus-4-8 too slow); the text `/api/interview` route is kept as a demo-safety fallback; Per-Interview Summary runs in a Next.js route after the WS persists the transcript. Confirm Deepgram params + Aura voice ids at the Saturday workshop.*
