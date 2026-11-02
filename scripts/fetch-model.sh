#!/usr/bin/env bash
# Скачивает маленькую русскую модель Vosk и перепаковывает в tar.gz для vosk-browser
set -euo pipefail
NAME=vosk-model-small-ru-0.22
OUT=public/models/vosk-model-small-ru.tar.gz
cd "$(dirname "$0")/.."
if [ -f "$OUT" ]; then echo "Модель уже есть: $OUT"; exit 0; fi
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
echo "Скачиваю $NAME (~45 МБ)…"
curl -fL --progress-bar -o "$TMP/model.zip" "https://alphacephei.com/vosk/models/$NAME.zip"
unzip -q "$TMP/model.zip" -d "$TMP"
mkdir -p public/models
tar -czf "$OUT" -C "$TMP" "$NAME"
echo "Готово: $OUT"
