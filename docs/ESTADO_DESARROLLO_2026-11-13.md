# CLIMESA: estado de desarrollo (13 de noviembre de 2026)

Esta entrega contiene ajustes locales en laboratorio, hospitalización e inventario; **no está desplegada** en Render ni en el enlace web de pruebas. No se aplicó ninguna migración remota ni se modificaron cuentas.

## Ajustes de esta entrega

- La API calcula `normal`, `alto`, `bajo`, `critico_*` o `sin_rango` desde el rango por examen, sexo, edad y fecha de la muestra. Ignora la marca enviada por versiones anteriores del cliente.
- La corrección de un resultado exige motivo y guarda el valor anterior en `laboratorio.resultado_historial`; se emite evento de actualización o de resultado crítico.
- El paciente puede consultar el estado de sus órdenes en todo momento; los valores se excluyen hasta la revisión del médico. Cada lectura de orden queda en auditoría.
- Web y Android dejaron de permitir elegir manualmente la marca. Web solicita motivo cuando se corrige un resultado.

## Verificación y límites

- `npm run build --prefix api` y `npm run build --prefix web`: pasan.
- `npm test --prefix api -- --runTestsByPath tests/laboratory.rules.spec.ts`: 10 pruebas pasan.
- Se actualizaron las pruebas heredadas de turnos a D-083 (publicación automática), sin quitar la verificación de descansos, traslapes ni permisos. La publicación explícita sigue probada solo para borradores históricos.
- La matriz RBAC valida cada permiso de alternativas `OR` y se actualizaron las rutas implementadas en `endpoints.csv`. `npm test --prefix api -- --silent`: 25 suites y 273 pruebas pasan. `npm test --prefix web -- --reporter=dot`: 13 archivos y 143 pruebas pasan. Ambas compilaciones pasan. `python3 tools/progreso.py --verificar`: sin errores.
- `npm run lint --prefix api` no pudo ejecutarse porque esta instalación no trae el ejecutable `eslint`; la compilación TypeScript sí pasa. No se ha ejecutado Android en un dispositivo en esta entrega.
- La toma de muestra ya exige doble identificación (expediente + nombre completo) en API, web y Android; una discrepancia se rechaza y queda dentro del flujo auditable.
- Hospitalización incorpora API, pantalla web y pantallas Android para admisiones activas, sugerencias y asignación de cama, aislamiento, alta y salida física. Las operaciones mantienen idempotencia, concurrencia optimista, auditoría y eventos; la salida deja la cama en limpieza.
- Inventario incorpora API, pantalla web y pantalla Android para existencias por lote/bodega y registro de consumo; API y web también cubren historial, artículos y movimientos de entrada, salida, traslado y ajuste. Se rechazan lotes vencidos y saldos negativos.
- Sigue pendiente la validación clínica extremo a extremo con datos ficticios, aviso push crítico y pruebas ampliadas de permisos/resultados.
- Las pruebas de aceptación con datos ficticios de hospitalización e inventario, la integración móvil completa (incluye todavía signos vitales, limpieza y notas clínicas), privacidad/auditoría de todos los módulos, push crítico y reportes siguen pendientes. Por tanto, **no solo faltan reportes**.

## Orden recomendado

1. Armonizar las specs 103/105/106/107 y los endpoints históricos con las decisiones y rutas ya implementadas, sin eliminar compatibilidad a ciegas.
2. Ejecutar pruebas de laboratorio PAC–LAB–MED con datos ficticios, incluyendo doble identificación, datos sin rango y correcciones.
3. Ejecutar pruebas de aceptación PAC–REC–MED–ENF–LAB para hospitalización e inventario con datos ficticios.
4. Probar en Android las pantallas de hospitalización e inventario con las cuentas de JOP, REC, ENF y MED; después continuar con privacidad, push crítico y reportes.
5. Crear PR por historia, revisar y fusionar; entonces desplegar la versión aprobada. No ejecutar “deploy latest commit” esperando que incluya estos cambios locales.
