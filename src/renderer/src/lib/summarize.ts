import { formatTranscript, type MeetingTurn } from './meetingLog'
import { openai } from './translate'

const SUMMARY_PROMPT = `You are an expert executive assistant for a clean energy company. Your task is to summarize the provided meeting transcript. The meeting heavily involves clean energy, carbon capture, grid modernization, and ESG topics. 
Format the output STRICTLY in Markdown with the following structure:
# Meeting Summary
**Date:** [Current Date]
## Core Topics Discussed
- [Bullet points of main clean energy topics]
## Key Decisions
- [Bullet points of decisions made]
## Action Items
- [Bullet points of tasks to be done, who will do them if mentioned]`

export async function summarizeMeeting(turns: MeetingTurn[]): Promise<string> {
  const currentDate = new Date().toLocaleDateString('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

  const completion = await openai().chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.2,
    messages: [
      { role: 'system', content: SUMMARY_PROMPT },
      {
        role: 'user',
        content: `Current date: ${currentDate}\n\n${formatTranscript(turns)}`
      }
    ]
  })

  const markdown = unwrapFence(completion.choices[0]?.message?.content?.trim() ?? '')
  if (!markdown) throw new Error('The summary came back empty.')
  return markdown
}

function unwrapFence(markdown: string): string {
  const fenced = markdown.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/)
  return fenced?.[1]?.trim() || markdown
}
