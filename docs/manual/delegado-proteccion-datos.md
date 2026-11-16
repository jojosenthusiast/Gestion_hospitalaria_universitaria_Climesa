# Manual del Delegado de protección de datos (DPD)

**Plataforma:** web (https://sghu-web.onrender.com).
**Qué hace:** revisa la auditoría y verifica su integridad (LPDP, artículos 15 a 17). No aprueba accesos: el módulo de acceso excepcional se retiró (D-082).

Antes de leer esta página, revisa [lo que vale para todos los roles](README.md#lo-que-vale-para-todos-los-roles).

## Menú

| Módulo | Para qué |
|---|---|
| Inicio | Tablero "Protección de datos" |
| Personal | Consultar cuentas y personal (solo lectura) |
| Bitácora de ambulancia | Consultar los servicios, sin datos del paciente |
| Auditoría | Buscar, revisar, exportar y verificar la cadena |
| Métricas | Indicadores |
| Perfil | Tu cuenta |

## Inicio

Accesos rápidos: **Buscar en la auditoría**, **Verificar la cadena** y **Ver métricas**.

## Auditoría

Cada lectura de datos de paciente y cada escritura quedan registradas: quién, cuándo, qué acción, sobre qué entidad y con qué resultado (también los intentos denegados). La auditoría guarda metadatos, nunca contenido clínico.

### Buscar

- Filtros: **Buscar persona**, **Expediente del paciente**, **Acción**, **Entidad** y **Desde / Hasta**, más rangos de fecha predefinidos.
- **Quitar filtros** limpia la búsqueda.
- **Ver detalle** abre un registro; **Registro siguiente** avanza al siguiente.

### Verificar la cadena

- Cada registro guarda el hash (SHA-256) del anterior. **Verificar integridad** recorre la cadena.
- El resultado es **Cadena íntegra** o **Cadena alterada**. Si está alterada, **Ver registro N** lleva al primer registro roto.
- **Verificar de nuevo** repite la comprobación.

### Exportar

**Exportar** en CSV, Excel (.xlsx) o PDF. La exportación también queda registrada en la auditoría.

## Personal

Ves las cuentas, sus roles y su estado. Filtros: **Mostrar** (cuentas activas, inactivas o todas) y **Rol**. No puedes invitar, cambiar roles ni desactivar.

## Bitácora de ambulancia

Servicios con hitos, actores y estado final, en vista de **Tarjetas** o **Tabla**, con filtros y **Exportar**. No muestra datos del paciente.

## Métricas

Indicador, rango de días, **Exportar** y **Exportar todo**.
