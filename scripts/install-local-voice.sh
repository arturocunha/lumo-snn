#!/bin/sh
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
voice_dir="$project_dir/../../work/local-voice"
mkdir -p "$voice_dir"
cd "$voice_dir"
if ! [ -x whisper.cpp-1.5.5/main ]; then
 curl --fail --location --retry 2 'https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v1.5.5.tar.gz' -o whisper-src.tar.gz
 printf '%s  %s\n' '27fa5c472657af2a6cee63de349a34b23d0f3781fa9b8ef301a940cf64964a79' 'whisper-src.tar.gz' | sha256sum -c -
 tar -xzf whisper-src.tar.gz
 make -C whisper.cpp-1.5.5 -j2 main
fi
model=ggml-small-q5_1.bin
checksum=ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb
if ! [ -f "$model" ] || ! printf '%s  %s\n' "$checksum" "$model" | sha256sum -c - >/dev/null 2>&1; then
 curl --fail --location --retry 2 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small-q5_1.bin' -o "$model.part"
 printf '%s  %s\n' "$checksum" "$model.part" | sha256sum -c -
 mv "$model.part" "$model"
fi
printf 'Voz instalada em %s\n' "$voice_dir"
