import type { Model, KaldiRecognizer } from 'vosk-browser'
import { VOCABULARY } from './numbers'

const MODEL_URL = `${import.meta.env.BASE_URL}models/vosk-model-small-ru.tar.gz`

let modelPromise: Promise<Model> | null = null

export function loadModel(): Promise<Model> {
  // vosk (~6 МБ с WASM) грузим отдельным чанком, чтобы интерфейс открывался сразу
  modelPromise ??= import('vosk-browser').then((v) => v.createModel(MODEL_URL))
  return modelPromise
}

export interface Listener {
  stop(): void
}

export async function listen(handlers: {
  onPartial(text: string): void
  onFinal(text: string): void
}): Promise<Listener> {
  const model = await loadModel()

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  })
  const ctx = new AudioContext()
  const grammar = JSON.stringify([...VOCABULARY, '[unk]'])
  const recognizer: KaldiRecognizer = new model.KaldiRecognizer(ctx.sampleRate, grammar)

  recognizer.on('partialresult', (m) => {
    if (m.event === 'partialresult') handlers.onPartial(m.result.partial)
  })
  recognizer.on('result', (m) => {
    if (m.event === 'result' && m.result.text) handlers.onFinal(m.result.text)
  })

  // ScriptProcessorNode устарел, но так рекомендует vosk-browser и работает везде
  const source = ctx.createMediaStreamSource(stream)
  const processor = ctx.createScriptProcessor(4096, 1, 1)
  processor.onaudioprocess = (e) => {
    try {
      recognizer.acceptWaveform(e.inputBuffer)
    } catch (err) {
      console.error('acceptWaveform failed', err)
    }
  }
  source.connect(processor)
  processor.connect(ctx.destination)

  return {
    stop() {
      recognizer.retrieveFinalResult()
      processor.disconnect()
      source.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      // даём финальному результату дойти до колбэка
      setTimeout(() => {
        recognizer.remove()
        void ctx.close()
      }, 300)
    },
  }
}
