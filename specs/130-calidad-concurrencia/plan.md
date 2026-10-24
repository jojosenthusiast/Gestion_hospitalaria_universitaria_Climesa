# 130. Plan

- Proyecto `Sghu.Tests` con el ejecutor de pruebas que el equipo prefiera (xUnit en su entorno; el legado usaba un ejecutor propio por restricciones del entorno de investigación).
- Ayudante `Concurrente.Ejecutar(n, accion)` que lanza `n` tareas con una barrera para que lleguen juntas a la base.
- GitHub Actions: servicio PostgreSQL 16, `dotnet test`, `npm ci && npm run build && npm test`, `./gradlew assembleDebug test`, `python3 tools/generar_docs.py --verificar`, `python3 tools/progreso.py --verificar`. iOS se compila en la Mac universitaria (los ejecutores macOS de GitHub cuestan minutos).
- `tools/demo-concurrencia/`: programa de consola que llama la API desplegada con dos usuarios a la vez.
- Lista de pruebas manuales generada desde `pantallas.csv` (una fila por pantalla y estado).
