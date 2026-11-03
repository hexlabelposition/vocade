import type { Model, KaldiRecognizer } from 'vosk-browser'
import { VOCABULARY } from './numbers'

const MODEL_URL = `${import.meta.env.BASE_URL}models/vosk-model-small-ru-grammar.tar.gz`

let modelPromise: Promise<Model> | null = null

export function loadModel(): Promise<Model> {
  // vosk (~6 МБ с WASM) грузим отдельным чанком, чтобы интерфейс открывался сразу
  modelPromise ??= import('vosk-browser')
    .then((v) => v.createModel(MODEL_URL))
    .then((model) => {
      void removeStaleModels()
      return model
    })
  return modelPromise
}

/**
 * vosk-browser кэширует распакованную модель в IndexedDB ("/vosk") и при каждом
 * запуске читает в память весь этот кэш целиком. Поэтому старые версии модели
 * (после смены файла) удаляем, иначе загрузка только замедляется.
 * Вызывать после загрузки модели: к этому моменту воркер уже синхронизировал ФС.
 */
function removeStaleModels(): Promise<void> {
  // так vosk-browser называет каталог модели: /vosk/<url с \W заменёнными на _>
  const current = MODEL_URL.replace(/\W/g, '_')
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open('/vosk')
    } catch {
      return resolve()
    }
    req.onerror = () => resolve()
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('FILE_DATA')) {
        db.close()
        return resolve()
      }
      const tx = db.transaction('FILE_DATA', 'readwrite')
      const store = tx.objectStore('FILE_DATA')
      store.openKeyCursor().onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursor | null>).result
        if (!cursor) return
        const dir = String(cursor.key).split('/')[2] // "/vosk/<dir>/..."
        if (dir && dir !== current) store.delete(cursor.primaryKey)
        cursor.continue()
      }
      const done = () => {
        db.close()
        resolve()
      }
      tx.oncomplete = tx.onerror = tx.onabort = done
    }
  })
}

export interface Listener {
  stop(): void
}

// Автостоп: после последнего распознанного слова ждём SILENCE_MS тишины,
// а если вообще ничего не сказали — выключаемся через IDLE_MS.
const SILENCE_MS = 1500
const IDLE_MS = 3000
// Пока модель грузится, звук копим в памяти, но не бесконечно
const MAX_PENDING_SEC = 60

/**
 * Включает микрофон сразу, не дожидаясь модели. Пока модель грузится, звук копится
 * в буфере; как только она готова, буфер прогоняется через распознаватель, и дальше
 * распознавание идёт вживую. Промис отклоняется только при ошибке микрофона;
 * если не загрузится модель, микрофон выключится сам и придёт onError.
 */
export async function listen(handlers: {
  onPartial(text: string): void
  onFinal(text: string): void
  onAutoStop(): void
  onError?(err: unknown): void
}): Promise<Listener> {
  const modelReady = loadModel()

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  })
  const ctx = new AudioContext()

  let recognizer: KaldiRecognizer | null = null
  let pending: Float32Array[] = []
  let pendingSamples = 0
  let stopped = false // микрофон выключен
  let disposed = false // распознаватель и AudioContext освобождены

  let startedAt = 0 // момент, когда распознаватель начал работать
  let lastActivity = 0 // 0 — ещё ничего не услышали
  let lastPartial = ''
  let watchdog: ReturnType<typeof setInterval> | undefined

  // ScriptProcessorNode устарел, но так рекомендует vosk-browser и работает везде
  const source = ctx.createMediaStreamSource(stream)
  const processor = ctx.createScriptProcessor(4096, 1, 1)
  processor.onaudioprocess = (e) => {
    if (recognizer) {
      try {
        recognizer.acceptWaveform(e.inputBuffer)
      } catch (err) {
        console.error('acceptWaveform failed', err)
      }
    } else if (pendingSamples < MAX_PENDING_SEC * ctx.sampleRate) {
      // буфер переиспользуется браузером, поэтому копируем
      const chunk = e.inputBuffer.getChannelData(0).slice()
      pending.push(chunk)
      pendingSamples += chunk.length
    }
  }
  source.connect(processor)
  processor.connect(ctx.destination)

  modelReady.then(
    (model) => {
      if (disposed) return
      const grammar = JSON.stringify([...VOCABULARY, '[unk]'])
      const rec = new model.KaldiRecognizer(ctx.sampleRate, grammar)

      rec.on('partialresult', (m) => {
        if (m.event !== 'partialresult') return
        const text = m.result.partial
        // partial приходит на каждый буфер, активностью считаем только изменение текста
        if (text && text !== lastPartial) lastActivity = performance.now()
        lastPartial = text
        handlers.onPartial(text)
      })
      rec.on('result', (m) => {
        if (m.event === 'result' && m.result.text) {
          lastActivity = performance.now()
          lastPartial = ''
          handlers.onFinal(m.result.text)
        }
      })

      // сначала всё, что накопилось, пока грузилась модель
      for (const chunk of pending) rec.acceptWaveformFloat(chunk, ctx.sampleRate)
      pending = []
      recognizer = rec

      if (stopped) {
        // нажали «Стоп» до загрузки модели — дораспознаём накопленное и закрываемся
        dispose()
        return
      }
      // таймер тишины запускаем только сейчас, иначе он сработал бы во время загрузки
      startedAt = performance.now()
      watchdog = setInterval(() => {
        const now = performance.now()
        const silent = lastActivity
          ? now - lastActivity > SILENCE_MS && !lastPartial
          : now - startedAt > IDLE_MS
        if (silent) {
          stop()
          handlers.onAutoStop()
        }
      }, 200)
    },
    (err) => {
      stop()
      pending = []
      dispose()
      handlers.onError?.(err)
    },
  )

  function dispose() {
    if (disposed) return
    disposed = true
    if (!recognizer) {
      void ctx.close()
      return
    }
    const rec = recognizer
    rec.retrieveFinalResult()
    // даём финальному результату дойти до колбэка
    setTimeout(() => {
      rec.remove()
      void ctx.close()
    }, 300)
  }

  function stop() {
    if (stopped) return
    stopped = true
    clearInterval(watchdog)
    processor.disconnect()
    source.disconnect()
    stream.getTracks().forEach((t) => t.stop())
    // если модель ещё грузится, накопленный звук распознаем, когда она будет готова
    if (recognizer) dispose()
  }

  return { stop }
}
