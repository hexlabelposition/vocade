#!/usr/bin/env bash
# Готовит модель Vosk для vosk-browser: public/models/vosk-model-<хэш>.tar.gz
#
# Исходную маленькую русскую модель скачиваем один раз в .model-cache/ и урезаем
# под нашу задачу (подробности в scripts/strip-lm.py): так она вдвое меньше и
# заметно быстрее грузится на слабых телефонах. Словарь модели берётся из
# VOCABULARY в src/numbers.ts, поэтому при его изменении модель пересобирается.
#
# Хэш содержимого в имени файла нужен, чтобы браузер не взял старую модель из
# кэша IndexedDB: vosk-browser кэширует распакованную модель по её URL.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME=vosk-model-small-ru-0.22
ZIP=.model-cache/$NAME.zip
OUT_DIR=public/models
STAMP=.model-cache/vosk-model.stamp

# всё, от чего зависит результат сборки
vocab=$(node --experimental-strip-types --no-warnings -e \
  "import('./src/numbers.ts').then(m => console.log(m.VOCABULARY.join('\n')))")
inputs_hash=$( {
  echo "$NAME"
  echo "$vocab"
  cat scripts/fetch-model.sh scripts/strip-lm.py
} | sha256sum | cut -c1-16)

if [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$inputs_hash" ] && ls "$OUT_DIR"/vosk-model-*.tar.gz >/dev/null 2>&1; then
  echo "Модель актуальна: $(ls "$OUT_DIR"/vosk-model-*.tar.gz)"
  exit 0
fi

if [ ! -f "$ZIP" ]; then
  mkdir -p .model-cache
  echo "Скачиваю $NAME (~45 МБ)…"
  curl -fL --progress-bar -o "$ZIP.part" "https://alphacephei.com/vosk/models/$NAME.zip"
  mv "$ZIP.part" "$ZIP"
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
echo "Собираю модель…"
unzip -q "$ZIP" -d "$TMP"
echo "$vocab" > "$TMP/vocab.txt"
python3 scripts/strip-lm.py "$TMP/$NAME/graph" "$TMP/vocab.txt"

# детерминированный архив: одинаковые входы дают одинаковый хэш и имя файла
tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner \
  -cf - -C "$TMP" "$NAME" | gzip -n -9 > "$TMP/model.tar.gz"
hash=$(sha256sum "$TMP/model.tar.gz" | cut -c1-8)

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/vosk-model*.tar.gz
mv "$TMP/model.tar.gz" "$OUT_DIR/vosk-model-$hash.tar.gz"
echo "$inputs_hash" > "$STAMP"
echo "Готово: $OUT_DIR/vosk-model-$hash.tar.gz"
