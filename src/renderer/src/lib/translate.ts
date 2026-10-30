import OpenAI from 'openai'
import type { CaptionLanguage } from '../../../shared/ipc'
import { requireKey } from './keys'

const SYSTEM_PROMPT = `You are an expert simultaneous interpreter specializing in the clean energy and renewable sector. Accurately translate terms related to carbon capture, hydrogen fuel cells, grid modernization, and ESG policies. Maintain a professional meeting tone.
Return a JSON object with exactly three keys: "en", "ko", and "ja".
en is English, ko is Korean, and ja is Japanese.
If the input is already in one of those languages, copy it unchanged into that key and translate it into the other two.
Output only the JSON object.`

export interface MultiTranslation {
  en: string
  ko: string
  ja: string
}

let client: OpenAI | null = null

export function resetOpenAI(): void {
  client = null
}

export function openai(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: requireKey('openai'),
      dangerouslyAllowBrowser: true
    })
  }
  return client
}

export async function translateSentence(sentence: string, sourceLanguage: CaptionLanguage | null): Promise<MultiTranslation> {
  const completion = await openai().chat.completions.create(
    {
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: sentence }
      ]
    },
    { maxRetries: 0 }
  )

  const translated = parseTranslation(completion.choices[0]?.message?.content?.trim() ?? '')
  if (sourceLanguage) translated[sourceLanguage] = sentence
  return translated
}

function parseTranslation(raw: string): MultiTranslation {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('The translation was not in the expected format.')
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  const translation = {
    en: typeof parsed.en === 'string' ? parsed.en.trim() : '',
    ko: typeof parsed.ko === 'string' ? parsed.ko.trim() : '',
    ja: typeof parsed.ja === 'string' ? parsed.ja.trim() : ''
  }
  if (!translation.en && !translation.ko && !translation.ja) {
    throw new Error('The translation came back empty.')
  }
  return translation
}
