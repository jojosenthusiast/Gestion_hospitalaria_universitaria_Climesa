# Fixtures de contrato (iOS)

Cada archivo `*.json` de esta carpeta es un cuerpo de escritura real de la app, con esta forma:

```json
{ "operation": "POST /admisiones/indicaciones", "source": "<función o tipo que arma el cuerpo>", "body": { } }
```

- `operation`: método y ruta tal como están en `contrato/openapi.json`, sin el prefijo `/api/v1` y con los parámetros como plantilla (`/consultas/{id}/receta`).
- `body`: el JSON exacto que la app envía, con datos ficticios.

Dos pruebas lo mantienen honesto:

1. **Prueba unitaria de iOS (`Tests/CoreTests`)** arma el cuerpo con el código de producción (por ejemplo `JSONBody.encode(AdmissionBody(...))`, que ordena las claves; compara como JSON, no como texto) y comprueba que es igual al `body` del fixture. Si cambias cómo la app arma un cuerpo, actualiza el fixture en el mismo PR.
2. **API (CI)**: `api/tests/contrato-movil.spec.ts` valida cada fixture contra el esquema de su operación en `contrato/openapi.json` (con ajv y objetos cerrados: un campo que la API no conoce también falla, porque la API lo rechaza con `forbidNonWhitelisted`). El workflow `API` corre al cambiar esta carpeta.

Un cuerpo que hoy está desalineado del contrato está listado en `KNOWN_DRIFT` de esa prueba: debe fallar la validación hasta que se corrija la app. Al corregirlo, quita la entrada; la prueba falla si un fixture listado ya es válido.

Endpoints críticos que deben tener fixture: indicación de hospitalización, crear/solicitar/cancelar cita, iniciar consulta, receta, signos vitales, alta y `PATCH /me/paciente`.

Para leerlos con `Bundle.module`, el target `CoreTests` de `Package.swift` debe declarar `resources: [.copy("Fixtures")]`; también puedes leerlos con `#filePath` relativo a la prueba.
