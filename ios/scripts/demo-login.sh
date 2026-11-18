#!/bin/sh
# TEMPORARY testing aid (docs/operacion/login-de-prueba.md). Generates the git-ignored ios/DemoLogin.xcconfig from
# ../demo-credenciales.json, so Debug builds show the test-account selector (Release never includes it) on the sign-in screen.
#   sh ios/scripts/demo-login.sh        enable (run on the Mac, then build in Xcode)
#   sh ios/scripts/demo-login.sh --off  disable (delete the generated file; do this before final delivery)
set -eu
ios_dir=$(cd "$(dirname "$0")/.." && pwd)
source_file="$ios_dir/../demo-credenciales.json"
output_file="$ios_dir/DemoLogin.xcconfig"
if [ "${1:-}" = "--off" ]; then
  rm -f "$output_file"
  echo "Login de prueba desactivado: se borró ios/DemoLogin.xcconfig."
  exit 0
fi
if [ ! -f "$source_file" ]; then
  echo "No existe demo-credenciales.json en la raíz del repositorio." >&2
  exit 1
fi
# Only roles that use iOS reach the build: the same rule as Core (DemoLogin.usesIOS; DemoLoginTests checks they match).
ios_roles="MED PAC"
# Python 3 comes with the Xcode command line tools, which building the app already needs.
python=/usr/bin/python3
[ -x "$python" ] || python=$(command -v python3 || true)
if [ -z "$python" ]; then
  echo "Falta python3 (viene con las herramientas de línea de comandos de Xcode: xcode-select --install)." >&2
  exit 1
fi
# Hexadecimal text: xcconfig treats // as a comment, so the JSON cannot be written as is.
hex=$("$python" -c '
import json, sys
roles = sys.argv[2].split()
with open(sys.argv[1], encoding="utf-8") as source:
    entries = json.load(source)
kept = [entry for entry in entries if isinstance(entry, dict) and entry.get("rol") in roles]
print(json.dumps(kept, ensure_ascii=False, separators=(",", ":")).encode("utf-8").hex())
' "$source_file" "$ios_roles") || { echo "demo-credenciales.json no es JSON válido." >&2; exit 1; }
if [ "$hex" = "5b5d" ]; then
  echo "demo-credenciales.json no tiene cuentas de roles de iOS ($ios_roles)." >&2
  exit 1
fi
{
  echo "// Generado por ios/scripts/demo-login.sh. TEMPORAL y fuera de git: contiene contraseñas de cuentas ficticias."
  echo "CLIMESA_DEMO_LOGIN = YES"
  echo "CLIMESA_DEMO_CREDENTIALS = $hex"
} > "$output_file"
echo "Login de prueba activado: se generó ios/DemoLogin.xcconfig. Compila de nuevo la app."
