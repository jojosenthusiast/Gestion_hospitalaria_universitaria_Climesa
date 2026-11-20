# Binarios

Builds del 20 nov 2026 (auditoría de flujos), apuntan a producción (`https://sghu-api.onrender.com/api/v1`).

- `android/CLIMESA-android-2026-11-20.apk`: Android, todos los roles. Sin cuentas de prueba embebidas; se entra con correo y contraseña.
- `ios/CLIMESA-ios-2026-11-20-sin-firmar.ipa`: iOS (médico y paciente), sin firmar. Lo firma quien lo instala (Sideloadly + Apple ID); ver `ios/README.md`. Generado por el workflow iOS a partir de `feat/lote5-ios` con las correcciones de la auditoría.
- `anteriores/CLIMESA-0.1.0-demo.apk`: demo local antigua, sin el core actual.