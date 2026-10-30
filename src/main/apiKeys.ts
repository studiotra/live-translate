import { app, safeStorage } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { ApiKeyStatus, ApiKeyValues } from '../shared/ipc'

interface StoredKeys {
  deepgram?: string
  openai?: string
}

function storePath(): string {
  return join(app.getPath('userData'), 'api-keys.json')
}

async function readStore(): Promise<StoredKeys> {
  try {
    const parsed = JSON.parse(await readFile(storePath(), 'utf8')) as StoredKeys
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function writeStore(store: StoredKeys): Promise<void> {
  await writeFile(storePath(), `${JSON.stringify(store)}\n`, 'utf8')
}

function decrypt(value: string | undefined): string {
  if (!value || !safeStorage.isEncryptionAvailable()) return ''
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64')).trim()
  } catch {
    return ''
  }
}

function encrypt(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('This Mac cannot store API keys securely yet. Unlock the login keychain and try again.')
  }
  return safeStorage.encryptString(value).toString('base64')
}

export async function readApiKeys(): Promise<ApiKeyValues> {
  const store = await readStore()
  return {
    deepgram: decrypt(store.deepgram),
    openai: decrypt(store.openai)
  }
}

export async function apiKeyStatus(): Promise<ApiKeyStatus> {
  const keys = await readApiKeys()
  return {
    deepgram: keys.deepgram.length > 0,
    openai: keys.openai.length > 0
  }
}

export async function saveApiKeys(input: { deepgram?: string; openai?: string }): Promise<ApiKeyStatus> {
  const store = await readStore()
  if (input.deepgram) store.deepgram = encrypt(input.deepgram)
  if (input.openai) store.openai = encrypt(input.openai)
  await writeStore(store)
  return apiKeyStatus()
}

export async function clearApiKeys(): Promise<ApiKeyStatus> {
  await writeStore({})
  return { deepgram: false, openai: false }
}
