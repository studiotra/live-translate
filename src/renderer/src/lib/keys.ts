export type KeySource = 'saved' | 'build' | 'missing'

export interface ResolvedKeys {
  deepgram: string
  openai: string
  deepgramSource: KeySource
  openaiSource: KeySource
}

const emptyKeys: ResolvedKeys = {
  deepgram: '',
  openai: '',
  deepgramSource: 'missing',
  openaiSource: 'missing'
}

let resolved: ResolvedKeys = emptyKeys

function builtIn(name: 'VITE_DEEPGRAM_API_KEY' | 'VITE_OPENAI_API_KEY'): string {
  return import.meta.env[name]?.trim() ?? ''
}

function sourceFor(saved: string, built: string): KeySource {
  if (saved) return 'saved'
  if (built) return 'build'
  return 'missing'
}

export function currentKeys(): ResolvedKeys {
  return resolved
}

export async function refreshKeys(): Promise<ResolvedKeys> {
  const saved = await window.api.getApiKeys()
  const deepgramBuild = builtIn('VITE_DEEPGRAM_API_KEY')
  const openaiBuild = builtIn('VITE_OPENAI_API_KEY')
  resolved = {
    deepgram: saved.deepgram || deepgramBuild,
    openai: saved.openai || openaiBuild,
    deepgramSource: sourceFor(saved.deepgram, deepgramBuild),
    openaiSource: sourceFor(saved.openai, openaiBuild)
  }
  return resolved
}

export function requireKey(which: 'deepgram' | 'openai'): string {
  const value = resolved[which]
  if (!value) {
    throw new Error('Add your Deepgram and OpenAI keys under API keys, then try again.')
  }
  return value
}

export async function checkApiKey(which: 'deepgram' | 'openai', value: string): Promise<string> {
  const key = value.trim()
  const label = which === 'deepgram' ? 'Deepgram' : 'OpenAI'
  if (!key) return `${label} key is missing.`
  try {
    const response =
      which === 'deepgram'
        ? await fetch('https://api.deepgram.com/v1/projects', { headers: { Authorization: `Token ${key}` } })
        : await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } })
    if (response.ok) return `${label} key works.`
    if (response.status === 401 || response.status === 403) return `${label} rejected this key.`
    if (which === 'openai' && response.status === 429) return 'OpenAI key is valid, but the account has no credit or is rate limited.'
    return `${label} could not be reached (${response.status}).`
  } catch {
    return `${label} could not be reached. Check the network and try again.`
  }
}
