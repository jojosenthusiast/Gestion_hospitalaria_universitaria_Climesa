#!/bin/sh
# TEMPORARY testing aid (docs/operacion/login-de-prueba.md). Generates the git-ignored ios/DemoLogin.xcconfig from
# ../demo-credenciales.json, so Debug and Release builds show the test-account selector on the sign-in screen.
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
# Hexadecimal text: xcconfig treats // as a comment, so the JSON cannot be written as is.
hex=$(od -An -v -tx1 "$source_file" | tr -d ' 
')
{
  echo "// Generado por ios/scripts/demo-login.sh. TEMPORAL y fuera de git: contiene contraseñas de cuentas ficticias."
  echo "CLIMESA_DEMO_LOGIN = YES"
  echo "CLIMESA_DEMO_CREDENTIALS = $hex"
} > "$output_file"
echo "Login de prueba activado: se generó ios/DemoLogin.xcconfig. Compila de nuevo la app."
