#!/usr/bin/env bash
# Imprime a senha de demonstracao lida de apps/mike-baguncinha/README.md (unico lugar onde ela fica).
# Uso: export MF_SENHA_DEMO="$(bash scripts/senha-demo.sh)"
set -euo pipefail
README="$(cd "$(dirname "$0")/.." && pwd)/apps/mike-baguncinha/README.md"
sed -n '/A senha é a mesma/,$p' "$README" | grep -o '`[^`]*`' | head -1 | tr -d '`'
