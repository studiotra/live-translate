export function requireEnv(name: 'VITE_DEEPGRAM_API_KEY' | 'VITE_OPENAI_API_KEY'): string {
  const value = import.meta.env[name]?.trim()
  if (!value) {
    throw new Error(`Add ${name} to the .env file, then restart the app.`)
  }
  return value
}
