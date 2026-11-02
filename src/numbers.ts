// Превращает русские числительные в строку цифр.
// "сорок шесть ноль семь" -> "4607", "двести пять" -> "205", "один два три" -> "123"

type Kind = 'zero' | 'unit' | 'teen' | 'ten' | 'hundred'

const WORDS: Record<string, [Kind, number]> = {
  ноль: ['zero', 0],
  нуль: ['zero', 0],
  один: ['unit', 1],
  одна: ['unit', 1],
  раз: ['unit', 1],
  два: ['unit', 2],
  две: ['unit', 2],
  три: ['unit', 3],
  четыре: ['unit', 4],
  пять: ['unit', 5],
  шесть: ['unit', 6],
  семь: ['unit', 7],
  восемь: ['unit', 8],
  девять: ['unit', 9],
  десять: ['teen', 10],
  одиннадцать: ['teen', 11],
  двенадцать: ['teen', 12],
  тринадцать: ['teen', 13],
  четырнадцать: ['teen', 14],
  пятнадцать: ['teen', 15],
  шестнадцать: ['teen', 16],
  семнадцать: ['teen', 17],
  восемнадцать: ['teen', 18],
  девятнадцать: ['teen', 19],
  двадцать: ['ten', 20],
  тридцать: ['ten', 30],
  сорок: ['ten', 40],
  пятьдесят: ['ten', 50],
  шестьдесят: ['ten', 60],
  семьдесят: ['ten', 70],
  восемьдесят: ['ten', 80],
  девяносто: ['ten', 90],
  сто: ['hundred', 100],
  двести: ['hundred', 200],
  триста: ['hundred', 300],
  четыреста: ['hundred', 400],
  пятьсот: ['hundred', 500],
  шестьсот: ['hundred', 600],
  семьсот: ['hundred', 700],
  восемьсот: ['hundred', 800],
  девятьсот: ['hundred', 900],
}

/** Словарь для grammar распознавателя: только эти слова и будут распознаваться. */
export const VOCABULARY = Object.keys(WORDS)

export function wordsToDigits(text: string): string {
  let out = ''
  // текущая группа ("двести сорок пять" = одна группа)
  let value = 0
  let hasTen = false
  let hasUnit = false // единицы или 10-19
  let open = false

  const flush = () => {
    if (open) out += String(value)
    value = 0
    hasTen = hasUnit = open = false
  }

  for (const raw of text.toLowerCase().replace(/ё/g, 'е').split(/\s+/)) {
    const entry = WORDS[raw]
    if (!entry) continue
    const [kind, n] = entry

    if (kind === 'zero') {
      flush()
      out += '0'
      continue
    }

    const fits =
      (kind === 'hundred' && !open) ||
      ((kind === 'ten' || kind === 'teen') && !hasTen && !hasUnit) ||
      (kind === 'unit' && !hasUnit)

    if (!fits) flush()

    value += n
    open = true
    if (kind === 'ten') hasTen = true
    if (kind === 'teen' || kind === 'unit') hasUnit = true
  }
  flush()
  return out
}
