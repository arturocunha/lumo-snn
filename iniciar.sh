#!/bin/sh
set -eu
cd "$(dirname "$0")"
# Etapa atual: prévia web. A integração desktop aguarda aprovação visual.
exec node scripts/preview.mjs
