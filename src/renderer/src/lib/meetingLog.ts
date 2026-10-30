export interface MeetingTurn {
  original: string
  en: string
  ko: string
  ja: string
}

export interface ScriptSections {
  original: string[]
  en: string[]
  ko: string[]
  ja: string[]
}

export function formatScript(sections: ScriptSections, dateLabel: string): string {
  return [
    '# Meeting Transcript',
    `**Date:** ${dateLabel}`,
    '',
    '## Original',
    sectionText(sections.original, '(no speech captured)'),
    '',
    '## English',
    sectionText(sections.en, '(no English yet)'),
    '',
    '## Korean',
    sectionText(sections.ko, '(no Korean yet)'),
    '',
    '## Japanese',
    sectionText(sections.ja, '(no Japanese yet)'),
    ''
  ].join('\n')
}

export function formatTranscript(turns: MeetingTurn[]): string {
  return turns
    .map((turn, index) => {
      return [
        `${index + 1}.`,
        `Original: ${turn.original.trim()}`,
        `English: ${turn.en.trim() || '(translation unavailable)'}`,
        `Korean: ${turn.ko.trim() || '(translation unavailable)'}`,
        `Japanese: ${turn.ja.trim() || '(translation unavailable)'}`
      ].join('\n')
    })
    .join('\n\n')
}

function sectionText(lines: string[], emptyLabel: string): string {
  return lines.length > 0 ? lines.join('\n\n') : emptyLabel
}
