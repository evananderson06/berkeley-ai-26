import { Candidate, FeedbackReport } from '@/types'

export const PLACEHOLDER_CANDIDATES: Candidate[] = [
  {
    id: 'c1',
    name: 'Sarah Chen',
    initials: 'SC',
    role: 'Senior Software Engineer',
    yearsExperience: 8,
    summary: 'Full-stack engineer with deep expertise in distributed systems and a strong track record of leading platform migrations at scale.',
    skills: ['TypeScript', 'Go', 'Kubernetes', 'PostgreSQL', 'System Design', 'Team Leadership'],
    qualityTier: 'strong',
    resumeStyle: 'executive',
    redFlags: [],
    greenFlags: [
      'Led migration of monolith to microservices serving 50M users',
      'Published open-source contributor with 2k+ GitHub stars',
      'Clear communicator — asks great clarifying questions',
    ],
    resume: {
      summary: 'Senior software engineer with 8 years building scalable backend systems. Passionate about developer experience and platform reliability. Previously led engineering teams of 6–8 at Series B and C stage companies.',
      experience: [
        {
          company: 'Meridian Health Tech',
          title: 'Staff Engineer',
          startDate: 'Jan 2021',
          endDate: 'Present',
          bullets: [
            'Architected microservices migration reducing p99 latency by 60%',
            'Mentored team of 6 engineers; 4 promoted within 18 months',
            'Designed HIPAA-compliant data pipeline processing 5M records/day',
          ],
        },
        {
          company: 'Cloudframe Inc.',
          title: 'Senior Software Engineer',
          startDate: 'Mar 2018',
          endDate: 'Dec 2020',
          bullets: [
            'Built real-time analytics engine in Go handling 200K events/sec',
            'Reduced infrastructure costs 35% via caching layer redesign',
          ],
        },
        {
          company: 'Pivotal Labs',
          title: 'Software Engineer',
          startDate: 'Jun 2016',
          endDate: 'Feb 2018',
          bullets: [
            'Delivered 4 client engagements across fintech and logistics verticals',
            'Introduced TDD practices that cut regression rate by 40%',
          ],
        },
      ],
      education: [
        { institution: 'University of Waterloo', degree: 'B.Sc. Computer Science', year: '2016' },
      ],
      skills: ['TypeScript', 'Go', 'Python', 'Kubernetes', 'PostgreSQL', 'Redis', 'Kafka', 'AWS', 'System Design'],
    },
  },
  {
    id: 'c2',
    name: 'Marcus Webb',
    initials: 'MW',
    role: 'Software Engineer',
    yearsExperience: 4,
    summary: 'Solid mid-level engineer with React/Node.js experience. Steady contributor, prefers well-scoped tasks over ambiguous greenfield work.',
    skills: ['React', 'Node.js', 'JavaScript', 'MySQL', 'REST APIs'],
    qualityTier: 'adequate',
    resumeStyle: 'modern',
    redFlags: ['Struggles with ambiguity', 'Limited experience beyond CRUD applications'],
    greenFlags: ['Reliable delivery', 'Good team collaborator'],
    resume: {
      summary: 'Software engineer with 4 years building web applications in React and Node.js. Comfortable in agile environments and experienced with REST API design.',
      experience: [
        {
          company: 'RetailNow Corp.',
          title: 'Software Engineer II',
          startDate: 'Aug 2022',
          endDate: 'Present',
          bullets: [
            'Maintained and extended e-commerce platform used by 300K monthly shoppers',
            'Implemented new checkout flow increasing conversion by 8%',
          ],
        },
        {
          company: 'Webflow Agency (Contract)',
          title: 'Frontend Developer',
          startDate: 'Jan 2021',
          endDate: 'Jul 2022',
          bullets: [
            'Built 12 client websites using React and headless CMS integrations',
            'Improved Lighthouse performance scores from avg 54 to 88',
          ],
        },
      ],
      education: [
        { institution: 'Arizona State University', degree: 'B.S. Information Technology', year: '2020' },
      ],
      skills: ['React', 'Node.js', 'JavaScript', 'TypeScript', 'MySQL', 'REST APIs', 'Git'],
    },
  },
  {
    id: 'c3',
    name: 'Priya Nair',
    initials: 'PN',
    role: 'Software Engineer',
    yearsExperience: 3,
    summary: 'Enthusiastic engineer two years out of bootcamp with solid fundamentals and a fast learning curve. Still building depth on complex backend topics.',
    skills: ['React', 'Python', 'Django', 'PostgreSQL', 'Docker'],
    qualityTier: 'adequate',
    resumeStyle: 'classic',
    redFlags: ['Limited system design experience', 'Gaps in CS fundamentals under pressure'],
    greenFlags: ['Fast learner', 'High initiative — ships features independently'],
    resume: {
      summary: 'Software engineer passionate about clean UIs and fast iteration. Built and shipped two internal tools at current employer that are now used company-wide.',
      experience: [
        {
          company: 'Stacklight Analytics',
          title: 'Junior Software Engineer',
          startDate: 'May 2022',
          endDate: 'Present',
          bullets: [
            'Built internal dashboard tool adopted by all 40 employees',
            'Migrated legacy PHP reports to Django REST + React frontend',
          ],
        },
        {
          company: 'Self-employed',
          title: 'Freelance Web Developer',
          startDate: 'Jan 2021',
          endDate: 'Apr 2022',
          bullets: [
            'Delivered 8 client projects including e-commerce and portfolio sites',
          ],
        },
      ],
      education: [
        { institution: 'BrainStation', degree: 'Software Engineering Diploma', year: '2021' },
        { institution: 'University of Toronto', degree: 'B.A. Psychology (incomplete)', year: '2019' },
      ],
      skills: ['React', 'Python', 'Django', 'PostgreSQL', 'Docker', 'HTML/CSS', 'JavaScript'],
    },
  },
  {
    id: 'c4',
    name: 'Derek Holloway',
    initials: 'DH',
    role: 'Principal Engineer',
    yearsExperience: 11,
    summary: 'Impressive résumé at name-brand companies with grand claims. Deep-dive questions reveal surface-level ownership of headline achievements.',
    skills: ['Java', 'Scala', 'Spark', 'AWS', 'Microservices', 'Agile'],
    qualityTier: 'poor',
    resumeStyle: 'flashy',
    redFlags: [
      'Cannot explain technical decisions he claims to have made',
      'Dismissive when challenged — becomes defensive',
      'Left last 3 roles within 12 months each',
      'Claims to have "led" projects but cannot name teammates or outcomes',
    ],
    greenFlags: ['Polished communicator', 'Strong initial impression'],
    resume: {
      summary: 'Principal engineer and technical leader with 11 years driving engineering excellence at Fortune 500 companies and high-growth startups. Expertise in distributed data systems and engineering culture.',
      experience: [
        {
          company: 'Amazon Web Services',
          title: 'Senior Software Engineer',
          startDate: 'Jan 2023',
          endDate: 'Nov 2023',
          bullets: [
            'Contributed to Aurora distributed storage engine optimizations',
            'Led cross-team initiative on cost observability tooling',
          ],
        },
        {
          company: 'Stripe',
          title: 'Software Engineer',
          startDate: 'Mar 2021',
          endDate: 'Dec 2022',
          bullets: [
            'Built reconciliation pipelines processing $2B daily transaction volume',
            'Drove adoption of internal platform tooling across 3 teams',
          ],
        },
        {
          company: 'Lyft',
          title: 'Software Engineer',
          startDate: 'Jun 2019',
          endDate: 'Feb 2021',
          bullets: [
            'Designed real-time pricing engine for dynamic surge calculation',
          ],
        },
      ],
      education: [
        { institution: 'Georgia Institute of Technology', degree: 'M.S. Computer Science', year: '2014' },
        { institution: 'University of Michigan', degree: 'B.S. Computer Science', year: '2013' },
      ],
      skills: ['Java', 'Scala', 'Apache Spark', 'AWS', 'Microservices', 'Kafka', 'Redis', 'PostgreSQL'],
    },
  },
  {
    id: 'c5',
    name: 'Tyler Bosh',
    initials: 'TB',
    role: 'Software Developer',
    yearsExperience: 1,
    summary: 'Recent graduate with 6 months professional experience. Confident but overestimates current capability. Needs significant ramp time.',
    skills: ['Python', 'JavaScript', 'HTML', 'CSS', 'Git'],
    qualityTier: 'poor',
    resumeStyle: 'garish',
    redFlags: [
      'Only 6 months professional experience',
      'Portfolio projects are tutorial clones',
      'Significantly overestimates seniority level',
    ],
    greenFlags: ['Enthusiastic', 'Coachable demeanor'],
    resume: {
      summary: 'Passionate developer and recent CS gratuate eager to contribute in a fast-moving team. Strong foundamentals in Python and JavaScript with hands-on experience shipping real world projects.',
      experience: [
        {
          company: 'TechStart Inc.',
          title: 'Junior Developer',
          startDate: 'Jan 2024',
          endDate: 'Present',
          bullets: [
            'Fixd bugs and writed unit tests for internal admin tools',
            'Participated in bi-weekly sprint planning and retrospectives, also assist with documentation',
          ],
        },
        {
          company: 'Self',
          title: 'Personal Projects',
          startDate: '2022',
          endDate: '2023',
          bullets: [
            'Built a to-do list app in React (deploy on vercel)',
            'Created weather dashbord using OpenWeatherMap API',
          ],
        },
      ],
      education: [
        { institution: 'Ontario Tech University', degree: 'B.Sc. Computer Science', year: '2023' },
      ],
      skills: ['Python', 'JavaScript', 'HTML', 'CSS', 'React', 'Git', 'SQL basics'],
    },
  },
]

export const PLACEHOLDER_FEEDBACK: FeedbackReport = {
  overallScore: 72,
  whatWentWell: [
    'You asked follow-up questions to dig deeper on vague answers.',
    'You gave candidates space to talk through their thought process.',
    'You covered both technical depth and communication style.',
  ],
  areasForImprovement: [
    'You didn\'t probe Derek Holloway\'s short tenures — a major red flag worth surfacing.',
    'Questions were occasionally too open-ended, allowing candidates to steer away from weaknesses.',
    'You spent less time with Sarah Chen than lower-tier candidates — consider prioritizing strong candidates.',
  ],
  correctHire: 'c1',
  userPickedCorrectly: false,
  keyMoments: [
    {
      quote: '"I basically owned the entire infrastructure migration."',
      commentary: 'Derek said this but couldn\'t name the other engineers on the project or explain the rollback strategy. This warranted a direct follow-up.',
    },
    {
      quote: '"I\'d want to understand the problem space better before committing to an approach."',
      commentary: 'Sarah\'s answer here showed strong engineering judgment. This was a standout green-flag moment.',
    },
  ],
}
