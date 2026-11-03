#!/usr/bin/env bash
# Скачивает маленькую русскую модель Vosk и перепаковывает в tar.gz для vosk-browser.
# Языковую модель для свободной речи (graph/Gr.fst, ~32 МБ) выкидываем: мы распознаём
# только по своей грамматике. Модель становится вдвое меньше и быстрее грузится
# при каждом запуске. Подробности в scripts/strip-lm.py.
set -euo pipefail
NAME=vosk-model-small-ru-0.22
OUT=public/models/vosk-model-small-ru-grammar.tar.gz
cd "$(dirname "$0")/.."
if [ -f "$OUT" ]; then echo "Модель уже есть: $OUT"; exit 0; fi
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
echo "Скачиваю $NAME (~45 МБ)…"
curl -fL --progress-bar -o "$TMP/model.zip" "https://alphacephei.com/vosk/models/$NAME.zip"
unzip -q "$TMP/model.zip" -d "$TMP"
python3 scripts/strip-lm.py "$TMP/$NAME/graph"
mkdir -p public/models
tar -czf "$OUT" -C "$TMP" "$NAME"
echo "Готово: $OUT"
