#!/bin/sh
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
runtime_dir="$project_dir/../../work/local-model"
mkdir -p "$runtime_dir"
cd "$runtime_dir"
model_file=Qwen3-0.6B-Q4_K_M.gguf
model_sha=ac2d97712095a558e31573f62f466a3f9d93990898b0ec79d7c974c1780d524a
archive_file=executor.tar.gz
archive_sha=9f10432ca3f66ef003a7a540aaffb9da0acadaefd05404521b9ab7a2436af304
if ! [ -f "$model_file" ] || ! printf '%s  %s\n' "$model_sha" "$model_file" | sha256sum -c - >/dev/null 2>&1; then
 curl --fail --location --retry 2 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/50968a4468ef4233ed78cd7c3de230dd1d61a56b/Qwen3-0.6B-Q4_K_M.gguf' -o "$model_file.part"
 printf '%s  %s\n' "$model_sha" "$model_file.part" | sha256sum -c -
 mv "$model_file.part" "$model_file"
fi
if ! [ -x llama-b12032/llama-server ]; then
 curl --fail --location --retry 2 'https://github.com/ggml-org/llama.cpp/releases/download/b12032/llama-b12032-bin-ubuntu-x64.tar.gz' -o "$archive_file"
 printf '%s  %s\n' "$archive_sha" "$archive_file" | sha256sum -c -
 tar -xzf "$archive_file"
 rm -f "$archive_file"
fi
printf 'Modelo e executor CPU prontos em %s\n' "$runtime_dir"
