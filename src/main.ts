import './style.css'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import { loadModel, listen, type Listener } from './speech'
import { wordsToDigits } from './numbers'

type Format = 'CODE128' | 'QR'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const input = $<HTMLInputElement>('digits')
const barcodeEl = document.getElementById('barcode') as unknown as SVGSVGElement
const qrEl = $<HTMLDivElement>('qr')
const placeholder = $<HTMLParagraphElement>('placeholder')
const partialEl = $<HTMLParagraphElement>('partial')
const micBtn = $<HTMLButtonElement>('mic')
const micLabel = $<HTMLSpanElement>('micLabel')
const statusEl = $<HTMLParagraphElement>('status')
const formatButtons = document.querySelectorAll<HTMLButtonElement>('[data-format]')

const storage = {
  get(key: string) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, v: string) {
    try {
      localStorage.setItem(key, v)
    } catch {
      /* приватный режим и т.п. */
    }
  },
}

let format: Format = storage.get('format') === 'QR' ? 'QR' : 'CODE128'
let listener: Listener | null = null

async function render() {
  const value = input.value.replace(/\D/g, '')
  if (input.value !== value) input.value = value

  const empty = value.length === 0
  placeholder.hidden = !empty
  barcodeEl.style.display = !empty && format === 'CODE128' ? '' : 'none'
  qrEl.hidden = empty || format !== 'QR'
  if (empty) return

  if (format === 'CODE128') {
    JsBarcode(barcodeEl, value, {
      format: 'CODE128',
      width: 2,
      height: 110,
      fontSize: 20,
      margin: 12,
      background: '#ffffff',
      lineColor: '#000000',
    })
  } else {
    qrEl.innerHTML = await QRCode.toString(value, {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel: 'M',
    })
  }
}

function setFormat(f: Format) {
  format = f
  storage.set('format', f)
  formatButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.format === f)))
  void render()
}

function append(digits: string) {
  if (!digits) return
  input.value += digits
  void render()
  navigator.vibrate?.(30)
}

// --- UI события ---
formatButtons.forEach((b) =>
  b.addEventListener('click', () => setFormat(b.dataset.format as Format)),
)
input.addEventListener('input', () => void render())
$('backspace').addEventListener('click', () => {
  input.value = input.value.slice(0, -1)
  void render()
})
$('clear').addEventListener('click', () => {
  input.value = ''
  partialEl.innerHTML = '&nbsp;'
  void render()
})

function resetMic() {
  listener = null
  micBtn.classList.remove('on')
  micLabel.textContent = 'Говорить'
}

// Тап по кнопке при открытой клавиатуре сначала снимает фокус с поля, клавиатура
// закрывается, и кнопка уезжает вниз из-под пальца — клик теряется. Поэтому фокус
// на pointerdown не трогаем, а клавиатуру закрываем уже в обработчике клика.
micBtn.addEventListener('pointerdown', (e) => e.preventDefault())

micBtn.addEventListener('click', async () => {
  input.blur()
  if (listener) {
    listener.stop()
    resetMic()
    partialEl.innerHTML = '&nbsp;'
    return
  }
  try {
    listener = await listen({
      onPartial: (t) => (partialEl.textContent = t || ' '),
      onFinal: (t) => {
        partialEl.textContent = t
        append(wordsToDigits(t))
      },
      // распознанный текст оставляем на экране, чтобы было видно, что услышано
      onAutoStop: resetMic,
    })
    micBtn.classList.add('on')
    micLabel.textContent = 'Стоп'
    statusEl.textContent = ''
  } catch (err) {
    console.error(err)
    statusEl.textContent =
      err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Нет доступа к микрофону. Разреши его в настройках браузера.'
        : 'Не удалось включить микрофон (нужен HTTPS или localhost).'
  }
})

// --- высота видимой области ---
// visualViewport уменьшается при открытой клавиатуре во всех браузерах (в отличие
// от vh/svh/dvh), так что кнопка микрофона остаётся над клавиатурой, если есть место.
const vv = window.visualViewport
if (vv) {
  const syncHeight = () => {
    // при pinch-zoom видимая область тоже «уменьшается» — это не клавиатура, игнорируем
    if (vv.scale > 1.01) return
    document.documentElement.style.setProperty('--vvh', `${vv.height}px`)
  }
  vv.addEventListener('resize', syncHeight)
  syncHeight()
}

// --- старт ---
setFormat(format)
loadModel()
  .then(() => {
    micBtn.disabled = false
    micLabel.textContent = 'Говорить'
  })
  .catch((err) => {
    console.error(err)
    micLabel.textContent = 'Модель не загрузилась'
    statusEl.textContent = 'Проверь, что файл модели лежит в public/models (npm run fetch-model).'
  })
