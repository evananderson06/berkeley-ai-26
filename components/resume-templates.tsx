'use client'

import React from 'react'
import { Candidate } from '@/types'

type TemplateProps = { candidate: Candidate }

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIC — Clean, minimal, ATS-friendly
// ─────────────────────────────────────────────────────────────────────────────
function ClassicTemplate({ candidate }: TemplateProps) {
  const { resume, name, role, yearsExperience } = candidate
  return (
    <div className="p-10 bg-white font-sans">
      <div className="mb-6 pb-4 border-b-2 border-slate-800">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{name}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {role} &middot; {yearsExperience} years experience
        </p>
      </div>

      <section className="mb-6">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">Profile</h2>
        <p className="text-sm text-slate-700 leading-relaxed">{resume.summary}</p>
      </section>

      <section className="mb-6">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-3">Experience</h2>
        <div className="space-y-5">
          {resume.experience.map((job, i) => (
            <div key={i}>
              <div className="flex justify-between items-baseline">
                <div>
                  <span className="text-sm font-semibold text-slate-900">{job.title}</span>
                  <span className="text-sm text-slate-500"> &mdash; {job.company}</span>
                </div>
                <span className="text-xs text-slate-400 shrink-0 ml-4">
                  {job.startDate}–{job.endDate}
                </span>
              </div>
              <ul className="mt-1.5 space-y-0.5 pl-4 list-disc list-outside">
                {job.bullets.map((b, j) => (
                  <li key={j} className="text-sm text-slate-600">{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-3">Education</h2>
        <div className="space-y-2">
          {resume.education.map((edu, i) => (
            <div key={i} className="flex justify-between items-baseline">
              <div>
                <span className="text-sm font-semibold text-slate-900">{edu.degree}</span>
                <span className="text-sm text-slate-500"> &middot; {edu.institution}</span>
              </div>
              <span className="text-xs text-slate-400 ml-4">{edu.year}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">Skills</h2>
        <div className="flex flex-wrap gap-1.5">
          {resume.skills.map((skill) => (
            <span key={skill} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full">
              {skill}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MODERN — Two-column: dark slate sidebar + white main
// ─────────────────────────────────────────────────────────────────────────────
function ModernTemplate({ candidate }: TemplateProps) {
  const { resume, name, role, yearsExperience } = candidate
  return (
    <div className="flex font-sans">
      {/* Sidebar */}
      <div className="w-56 shrink-0 bg-slate-800 text-white p-6 flex flex-col gap-6">
        <div>
          <h1 className="text-lg font-bold leading-snug">{name}</h1>
          <p className="text-xs text-teal-400 font-medium mt-1">{role}</p>
          <p className="text-xs text-slate-400 mt-0.5">{yearsExperience} yrs experience</p>
        </div>

        <div>
          <h2 className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-2">Skills</h2>
          <div className="flex flex-col gap-1.5">
            {resume.skills.map((skill) => (
              <span key={skill} className="text-xs bg-slate-700 text-slate-200 px-2 py-0.5 rounded">
                {skill}
              </span>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-2">Education</h2>
          <div className="flex flex-col gap-3">
            {resume.education.map((edu, i) => (
              <div key={i}>
                <p className="text-xs font-semibold text-white leading-snug">{edu.degree}</p>
                <p className="text-xs text-slate-400">{edu.institution}</p>
                <p className="text-xs text-teal-400">{edu.year}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 bg-white p-7">
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-teal-600 shrink-0">Profile</h2>
            <div className="flex-1 h-px bg-teal-100" />
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">{resume.summary}</p>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-teal-600 shrink-0">Experience</h2>
            <div className="flex-1 h-px bg-teal-100" />
          </div>
          <div className="space-y-5">
            {resume.experience.map((job, i) => (
              <div key={i} className="border-l-2 border-teal-200 pl-4">
                <div className="flex justify-between items-baseline">
                  <p className="text-sm font-semibold text-slate-900">{job.title}</p>
                  <span className="text-xs text-slate-400 ml-4 shrink-0">{job.startDate}–{job.endDate}</span>
                </div>
                <p className="text-xs text-teal-600 font-medium mb-1.5">{job.company}</p>
                <ul className="space-y-0.5">
                  {job.bullets.map((b, j) => (
                    <li key={j} className="text-xs text-slate-600 flex gap-1.5">
                      <span className="text-teal-400 shrink-0 mt-0.5">▸</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTIVE — Dark navy header, formal serif body, gold accents
// ─────────────────────────────────────────────────────────────────────────────
function ExecutiveTemplate({ candidate }: TemplateProps) {
  const { resume, name, role, yearsExperience } = candidate
  return (
    <div style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
      {/* Header */}
      <div className="bg-slate-900 px-10 py-8">
        <h1 className="text-3xl font-bold text-white tracking-wide">{name}</h1>
        <p
          style={{ fontFamily: 'system-ui, sans-serif' }}
          className="text-amber-400 text-sm mt-1.5 tracking-wider uppercase"
        >
          {role}&nbsp;&nbsp;&middot;&nbsp;&nbsp;{yearsExperience} Years
        </p>
      </div>

      {/* Body */}
      <div className="bg-white px-10 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-slate-200" />
          <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <section className="mb-7">
          <p className="text-sm text-slate-600 leading-relaxed italic border-l-4 border-amber-400 pl-4">
            {resume.summary}
          </p>
        </section>

        <section className="mb-7">
          <h2
            style={{ fontFamily: 'system-ui, sans-serif' }}
            className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-900 border-b border-slate-200 pb-1.5 mb-4"
          >
            Professional Experience
          </h2>
          <div className="space-y-6">
            {resume.experience.map((job, i) => (
              <div key={i}>
                <div className="flex justify-between items-baseline">
                  <p className="font-bold text-slate-900 text-sm">
                    {job.title}&nbsp;&nbsp;|&nbsp;&nbsp;{job.company}
                  </p>
                  <span
                    style={{ fontFamily: 'system-ui, sans-serif' }}
                    className="text-xs text-slate-500 ml-4 shrink-0"
                  >
                    {job.startDate} – {job.endDate}
                  </span>
                </div>
                <ul className="mt-2 space-y-1 pl-4 list-disc list-outside">
                  {job.bullets.map((b, j) => (
                    <li key={j} className="text-sm text-slate-600">{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-7">
          <h2
            style={{ fontFamily: 'system-ui, sans-serif' }}
            className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-900 border-b border-slate-200 pb-1.5 mb-4"
          >
            Education
          </h2>
          <div className="space-y-2">
            {resume.education.map((edu, i) => (
              <div key={i} className="flex justify-between items-baseline">
                <p className="text-sm">
                  <span className="font-bold text-slate-900">{edu.degree}</span>
                  <span className="text-slate-500"> &middot; {edu.institution}</span>
                </p>
                <span
                  style={{ fontFamily: 'system-ui, sans-serif' }}
                  className="text-xs text-slate-500 ml-4"
                >
                  {edu.year}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2
            style={{ fontFamily: 'system-ui, sans-serif' }}
            className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-900 border-b border-slate-200 pb-1.5 mb-4"
          >
            Core Competencies
          </h2>
          {/* em-space · em-space as separators */}
          <p className="text-sm text-slate-700">{resume.skills.join(' · ')}</p>
        </section>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FLASHY — Gradient header, emoji sections, colored backgrounds (over the top)
// ─────────────────────────────────────────────────────────────────────────────
function FlashyTemplate({ candidate }: TemplateProps) {
  const { resume, name, role, yearsExperience } = candidate
  return (
    <div className="font-sans">
      {/* Gradient header */}
      <div
        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 45%, #db2777 100%)' }}
        className="px-8 py-7 text-white"
      >
        <h1 className="text-4xl font-black tracking-tight">{name}</h1>
        <p className="text-purple-200 font-semibold mt-1">✨ {role} ✨</p>
        <p className="text-purple-300 text-xs mt-1">
          🚀 {yearsExperience} Years Driving Impact &amp; Innovation
        </p>
      </div>

      <div className="p-6 space-y-4 bg-white">
        {/* Summary */}
        <section className="rounded-xl border border-purple-200 bg-purple-50 p-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-purple-600 mb-2">
            💼 Professional Summary
          </h2>
          <p className="text-sm text-slate-700 leading-relaxed">{resume.summary}</p>
        </section>

        {/* Skills */}
        <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-3">
            ⚡ Core Skills &amp; Technologies
          </h2>
          <div className="flex flex-wrap gap-2">
            {resume.skills.map((skill) => (
              <span
                key={skill}
                style={{ background: 'linear-gradient(90deg, #4f46e5, #7c3aed)' }}
                className="text-xs text-white font-bold px-3 py-1 rounded-full"
              >
                {skill}
              </span>
            ))}
          </div>
        </section>

        {/* Experience */}
        <section className="rounded-xl border border-pink-200 bg-pink-50 p-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-pink-600 mb-3">
            🏆 Experience Highlights
          </h2>
          <div className="space-y-5">
            {resume.experience.map((job, i) => (
              <div key={i} className="border-l-4 border-purple-400 pl-4">
                <div className="flex justify-between items-start">
                  <p className="font-black text-slate-900 text-sm">{job.title}</p>
                  <span className="text-xs font-bold text-purple-600 ml-4 shrink-0">
                    {job.startDate}–{job.endDate}
                  </span>
                </div>
                <p className="text-xs font-bold text-pink-600 mb-2">@ {job.company}</p>
                <ul className="space-y-1">
                  {job.bullets.map((b, j) => (
                    <li key={j} className="text-xs text-slate-600 flex gap-1.5">
                      <span className="text-pink-400 shrink-0">★</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Education */}
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-3">
            🎓 Education
          </h2>
          <div className="space-y-2">
            {resume.education.map((edu, i) => (
              <p key={i} className="text-sm">
                <span className="font-bold text-slate-900">{edu.degree}</span>
                <span className="text-amber-600"> | {edu.institution} </span>
                <span className="text-xs text-slate-400">({edu.year})</span>
              </p>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// POORLY FORMATTED — Dated Word-doc style: a real attempt, just executed badly
// Burgundy section headers, blue-tinted header bar, generic Objective section,
// skills in a checkmark table, alternating row shading. Looks like 2010 Word.
// ─────────────────────────────────────────────────────────────────────────────
function GarishTemplate({ candidate }: TemplateProps) {
  const { resume, name, role, yearsExperience } = candidate

  const sectionHeader: React.CSSProperties = {
    fontFamily: 'Arial, sans-serif',
    fontSize: '10px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: '#7b0000',
    borderTop: '1px solid #7b0000',
    borderBottom: '1px solid #7b0000',
    padding: '2px 0',
    margin: '0 0 8px',
  }

  const skillRows = Array.from({ length: Math.ceil(resume.skills.length / 3) })

  return (
    <div style={{ fontFamily: 'Cambria, Georgia, serif', background: '#ffffff' }}>
      {/* Blue-tinted header — classic dated Word résumé look */}
      <div style={{ background: '#dce6f1', borderBottom: '3px solid #1f497d', padding: '16px 22px 12px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1f3864', margin: '0 0 2px', letterSpacing: '2px', textTransform: 'uppercase', fontFamily: 'Arial, sans-serif' }}>
          {name}
        </h1>
        <p style={{ fontSize: '11px', color: '#444', margin: 0, fontFamily: 'Arial, sans-serif' }}>
          {role}&nbsp;&nbsp;|&nbsp;&nbsp;{yearsExperience} Years of Professional Experience
        </p>
      </div>

      <div style={{ padding: '14px 22px' }}>
        {/* Generic Objective — very outdated */}
        <div style={{ marginBottom: '12px' }}>
          <p style={sectionHeader}>Objective</p>
          <p style={{ fontSize: '11px', color: '#333', margin: 0, lineHeight: '1.5', fontStyle: 'italic' }}>
            To obtain a challenging and rewarding position where I can utilize my skills and experience
            to contribute to organizational success while continuing to grow as a professional.
          </p>
        </div>

        {/* Summary */}
        <div style={{ marginBottom: '12px' }}>
          <p style={sectionHeader}>Professional Summary</p>
          <p style={{ fontSize: '11px', color: '#333', margin: 0, lineHeight: '1.5' }}>{resume.summary}</p>
        </div>

        {/* Experience */}
        <div style={{ marginBottom: '12px' }}>
          <p style={sectionHeader}>Work Experience</p>
          {resume.experience.map((job, i) => (
            <div key={i} style={{ marginBottom: '8px', background: i % 2 === 0 ? '#f4f4f4' : '#ffffff', padding: '6px 8px', border: '1px solid #e0e0e0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f3864', fontFamily: 'Arial, sans-serif' }}>{job.title}</span>
                <span style={{ fontSize: '10px', color: '#666', flexShrink: 0, marginLeft: '8px', fontFamily: 'Arial, sans-serif' }}>
                  {job.startDate} – {job.endDate}
                </span>
              </div>
              <p style={{ fontSize: '11px', color: '#555', fontStyle: 'italic', margin: '0 0 4px' }}>{job.company}</p>
              <ul style={{ margin: '0 0 0 16px', padding: 0 }}>
                {job.bullets.map((b, j) => (
                  <li key={j} style={{ fontSize: '11px', color: '#333', marginBottom: '1px', lineHeight: '1.4' }}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Education */}
        <div style={{ marginBottom: '12px' }}>
          <p style={sectionHeader}>Education</p>
          {resume.education.map((edu, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '5px' }}>
              <div>
                <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#1f3864', margin: 0, fontFamily: 'Arial, sans-serif' }}>{edu.degree}</p>
                <p style={{ fontSize: '11px', color: '#555', margin: 0 }}>{edu.institution}</p>
              </div>
              <span style={{ fontSize: '10px', color: '#666', flexShrink: 0, marginLeft: '8px', fontFamily: 'Arial, sans-serif' }}>{edu.year}</span>
            </div>
          ))}
        </div>

        {/* Skills — 3-column checkmark table */}
        <div>
          <p style={sectionHeader}>Skills &amp; Competencies</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {skillRows.map((_, rowI) => (
                <tr key={rowI}>
                  {resume.skills.slice(rowI * 3, rowI * 3 + 3).map((skill, colI) => (
                    <td key={colI} style={{ fontSize: '11px', color: '#333', padding: '1px 4px', width: '33%', verticalAlign: 'top' }}>
                      ✓&nbsp;{skill}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAOTIC — Inconsistent sizes, alternating alignment, mixed formatting
// ─────────────────────────────────────────────────────────────────────────────
function ChaoticTemplate({ candidate }: TemplateProps) {
  const { resume, name, role, yearsExperience } = candidate
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#fafafa', padding: '12px' }}>
      {/* Name absurdly large, role tiny */}
      <div style={{ textAlign: 'center', borderBottom: '3px double #333', paddingBottom: '10px', marginBottom: '10px' }}>
        <h1 style={{ fontSize: '44px', fontWeight: '900', color: '#1a1a2e', margin: 0, lineHeight: 1 }}>
          {name}
        </h1>
        <p style={{ fontSize: '10px', color: '#888', margin: '4px 0 0', letterSpacing: '0.08em' }}>
          {role} | {yearsExperience} Years Experience
        </p>
      </div>

      {/* Summary — medium heading, tiny body, left-indented */}
      <div style={{ marginBottom: '12px', paddingLeft: '35px' }}>
        <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#8b0000', display: 'block', marginBottom: '2px' }}>
          summary
        </span>
        <p style={{ fontSize: '10px', color: '#555', lineHeight: '1.4', margin: 0 }}>{resume.summary}</p>
      </div>

      {/* Experience — alternating left/right alignment */}
      <div style={{ marginBottom: '12px' }}>
        <p style={{ textAlign: 'center', fontSize: '24px', fontWeight: 'bold', color: '#333', margin: '0 0 8px', textDecoration: 'underline' }}>
          WORK HISTORY
        </p>
        {resume.experience.map((job, i) => (
          <div
            key={i}
            style={{
              marginBottom: '10px',
              paddingLeft: i % 2 === 0 ? '8px' : '50px',
              textAlign: i % 2 === 0 ? 'left' : 'right',
            }}
          >
            <p style={{ fontSize: i % 2 === 0 ? '15px' : '11px', fontWeight: 'bold', color: i % 2 === 0 ? '#1a1a2e' : '#555', margin: '0 0 2px' }}>
              {job.title} — {job.company}
            </p>
            <p style={{ fontSize: '9px', color: '#aaa', margin: '0 0 3px' }}>
              {job.startDate} to {job.endDate}
            </p>
            {job.bullets.map((b, j) => (
              <p key={j} style={{ fontSize: '11px', color: j % 2 === 0 ? '#333' : '#888', margin: '1px 0', fontStyle: j % 2 === 1 ? 'italic' : 'normal' }}>
                • {b}
              </p>
            ))}
          </div>
        ))}
      </div>

      {/* Education — right-aligned, lowercase heading */}
      <div style={{ textAlign: 'right', marginBottom: '12px' }}>
        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#444', display: 'block', marginBottom: '4px', textTransform: 'lowercase' }}>
          education
        </span>
        {resume.education.map((edu, i) => (
          <div key={i} style={{ marginBottom: '4px' }}>
            <p style={{ fontSize: '12px', fontWeight: '600', margin: 0 }}>{edu.degree}</p>
            <p style={{ fontSize: '10px', color: '#777', margin: 0 }}>{edu.institution} · {edu.year}</p>
          </div>
        ))}
      </div>

      {/* Skills — tiny label, dense text */}
      <div>
        <p style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.3em', color: '#bbb', margin: '0 0 4px' }}>
          SKILLS AND ABILITIES AND COMPETENCIES
        </p>
        <p style={{ fontSize: '13px', color: '#444', margin: 0 }}>{resume.skills.join(', ')}</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher — picks template based on candidate.resumeStyle
// ─────────────────────────────────────────────────────────────────────────────
export function ResumeDisplay({ candidate }: { candidate: Candidate }) {
  switch (candidate.resumeStyle ?? 'classic') {
    case 'modern':    return <ModernTemplate candidate={candidate} />
    case 'executive': return <ExecutiveTemplate candidate={candidate} />
    case 'flashy':   return <FlashyTemplate candidate={candidate} />
    case 'garish':   return <GarishTemplate candidate={candidate} />
    case 'chaotic':  return <ChaoticTemplate candidate={candidate} />
    default:         return <ClassicTemplate candidate={candidate} />
  }
}
