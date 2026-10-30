import { app } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'

export function saveMeetingSummary(markdown: string): Promise<string> {
  return saveDesktopMarkdown('CleanEnergy_Meeting_Summary', markdown)
}

export function saveMeetingTranscript(markdown: string): Promise<string> {
  return saveDesktopMarkdown('CleanEnergy_Meeting_Transcript', markdown)
}

async function saveDesktopMarkdown(prefix: string, markdown: string): Promise<string> {
  const desktop = app.getPath('desktop')
  const base = `${prefix}_${fileStamp(new Date())}`
  let filePath = join(desktop, `${base}.md`)

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      const body = markdown.endsWith('\n') ? markdown : `${markdown}\n`
      await writeFile(filePath, body, { encoding: 'utf8', flag: 'wx' })
      return filePath
    } catch (error) {
      if (!isAlreadyExists(error) || attempt === 20) throw error
      filePath = join(desktop, `${base}-${attempt + 1}.md`)
    }
  }

  throw new Error('Could not save the file.')
}

function fileStamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}_${hours}${minutes}`
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
}
