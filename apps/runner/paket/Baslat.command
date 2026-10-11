#!/bin/bash
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then echo "Node.js bulunamadı. https://nodejs.org adresinden LTS sürümünü kurun."; read -r; exit 1; fi
node calisan.mjs "$@"
