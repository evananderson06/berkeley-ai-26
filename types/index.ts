export type ResumeStyle = 'classic' | 'modern' | 'executive' | 'flashy' | 'garish' | 'chaotic'

export interface WorkExperience {
  company: string
  title: string
  startDate: string
  endDate: string
  bullets: string[]
}

export interface Education {
  institution: string
  degree: string
  year: string
}

export interface Resume {
  summary: string
  experience: WorkExperience[]
  education: Education[]
  skills: string[]
}

export interface Candidate {
  id: string
  name: string
  initials: string
  role: string
  yearsExperience: number
  summary: string
  skills: string[]
  qualityTier: 'exceptional' | 'strong' | 'adequate' | 'mediocre' | 'poor'
  redFlags: string[]
  greenFlags: string[]
  resume: Resume
  resumeStyle?: ResumeStyle
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface InterviewSession {
  sessionId: string
  jobTitle: string
  jobDescription: string
  candidates: Candidate[]
  interviews: Record<string, Message[]>
  notes: Record<string, string>
  hiringDecision?: string
  reasoning?: string
}

export interface FeedbackReport {
  overallScore: number
  whatWentWell: string[]
  areasForImprovement: string[]
  correctHire: string
  userPickedCorrectly: boolean
  keyMoments: { quote: string; commentary: string }[]
}
