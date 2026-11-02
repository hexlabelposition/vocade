import { wordsToDigits } from '../src/numbers.ts'
const cases: [string, string][] = [
  ['один два три', '123'],
  ['сорок шесть ноль семь', '4607'],
  ['двести пять', '205'],
  ['сто', '100'],
  ['двадцать двадцать', '2020'],
  ['пятнадцать восемь', '158'],
  ['девятьсот девяносто девять один', '9991'],
  ['ноль ноль один', '001'],
  ['[unk] три [unk] четыре', '34'],
  ['одиннадцать двенадцать', '1112'],
  ['двести двести', '200200'],
]
let fail = 0
for (const [i, exp] of cases) {
  const got = wordsToDigits(i)
  if (got !== exp) {
    fail++
    console.log(`FAIL "${i}" -> ${got}, ждали ${exp}`)
  }
}
console.log(fail ? `${fail} провалено` : `все ${cases.length} ок`)
process.exit(fail ? 1 : 0)
