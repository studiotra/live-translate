const TARGET_RATE = 16000
const FRAME_SAMPLES = 1280

export async function startPcmCapture(
  stream: MediaStream,
  onFrame: (pcm: ArrayBuffer) => void
): Promise<() => Promise<void>> {
  const context = createAudioContext()
  await context.resume()

  const source = context.createMediaStreamSource(stream)
  const processor = context.createScriptProcessor(2048, 1, 1)
  const mute = context.createGain()
  mute.gain.value = 0
  let pending: Float32Array<ArrayBufferLike> = new Float32Array(0)

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0)
    const resampled = resample(input, event.inputBuffer.sampleRate || context.sampleRate, TARGET_RATE)
    pending = concat(pending, resampled)
    while (pending.length >= FRAME_SAMPLES) {
      onFrame(toPcm16(pending.subarray(0, FRAME_SAMPLES)))
      pending = copyFrom(pending, FRAME_SAMPLES)
    }
  }

  source.connect(processor)
  processor.connect(mute)
  mute.connect(context.destination)

  return async () => {
    processor.onaudioprocess = null
    processor.disconnect()
    source.disconnect()
    mute.disconnect()
    await context.close()
  }
}

function createAudioContext(): AudioContext {
  try {
    return new AudioContext({ sampleRate: TARGET_RATE, latencyHint: 'interactive' })
  } catch {
    return new AudioContext({ latencyHint: 'interactive' })
  }
}

function resample(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return new Float32Array(input)
  const ratio = inputRate / outputRate
  const length = Math.max(0, Math.floor(input.length / ratio))
  const output = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio
    const left = Math.floor(position)
    const right = Math.min(left + 1, input.length - 1)
    const weight = position - left
    output[index] = input[left] * (1 - weight) + input[right] * weight
  }
  return output
}

function copyFrom(source: Float32Array, start: number): Float32Array {
  const copy = new Float32Array(source.length - start)
  copy.set(source.subarray(start))
  return copy
}

function concat(left: Float32Array, right: Float32Array): Float32Array {
  const merged = new Float32Array(left.length + right.length)
  merged.set(left)
  merged.set(right, left.length)
  return merged
}

function toPcm16(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2)
  const view = new DataView(buffer)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0))
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return buffer
}
