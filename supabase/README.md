# Base de datos (Supabase)

> Revisión 24-oct, corte 0.3.0: ahora hay 14 migraciones. La migración nueva se validó localmente y no fue aplicada remotamente porque las conexiones disponibles no exponen el proyecto CLIMESA. Los estados de nube del 17-oct que figuran debajo son evidencia histórica del archivo original; no se revalidaron en este corte. Usa `../deployment/README.md` para completar conexión y despliegue.

Estado: las 13 migraciones y la semilla están **aplicadas** en el proyecto Supabase "Gestion hospitalaria universitaria (Climesa)" (ref `gvmvmrusscsfbndnbvbr`, PostgreSQL 17) desde el 17-oct-2026. El asesor de seguridad de Supabase no reporta hallazgos.

## Contenido

| Carpeta o archivo | Qué es |
|---|---|
| `migrations/` | Esquemas por módulo: plataforma, acceso (+ semilla de roles y permisos generada), pacientes, infra, personal, atención, laboratorio, hospitalización, ambulancia, inventario, público, seguridad |
| `seed.sql` | Datos ficticios: edificio con 17 camas, laboratorio con paneles y rangos, CIE-10 frecuente, inventario, una ambulancia, 10 personas del personal |
| `pruebas/00_simular_supabase.sql` | Simula `auth` y `realtime` para probar en un PostgreSQL local |
| `pruebas/01_invariantes.sql` | 28 comprobaciones de reglas (cama exclusiva, capacidad, ciclos, VIP, DUI, turnos, fila, laboratorio, ambulancia, inventario, limpieza, outbox y Realtime, alta de usuarios, permisos, vista pública) |
| `pruebas/02_concurrencia.sh` | Sesiones simultáneas reales: 50 números de fila, última cama, ambulancia, turnos, DUI y citas |

## Estado de identidad y acceso

- Email y contraseña están habilitados con confirmación de correo.
- SMTP personalizado de Gmail fue comprobado mediante un correo de invitación.
- La cuenta inicial `tradleomun@gmail.com` está confirmada, activa y tiene únicamente el rol `ADM`.
- La asignación automática `PAC` producida al crear la cuenta fue retirada porque esta cuenta se destina a administración.

## Pasos pendientes

1. Dar contraseña y acceso al rol de la API (nunca en el repositorio):
   `alter role sghu_api login password '<contraseña segura>';`
   La cadena de conexión de la API usa ese rol, no `postgres`.
2. Activar el gancho de token: Authentication > Hooks > Customize Access Token > función `acceso.hook_token`.
3. Configurar las URL de redirección cuando se implemente recuperación de contraseña e invitaciones dentro de Android o web.
4. Una fila de prueba (`prueba.humo`) quedó en `plataforma.outbox` al verificar la publicación en Realtime; se puede borrar con `delete from plataforma.outbox where entidad_id = 'humo-1';`.

## Probar en local

```bash
createdb sghu_test
cat pruebas/00_simular_supabase.sql migrations/*.sql seed.sql | psql -v ON_ERROR_STOP=1 -d sghu_test
psql -At -d sghu_test -f pruebas/01_invariantes.sql      # todas las líneas deben decir OK
PSQL="psql -d sghu_test" ./pruebas/02_concurrencia.sh     # cada caso debe dar el valor esperado
```

## Reglas

- Una migración aplicada no se edita: los cambios van en una migración nueva.
- `20261017000210_acceso_semilla.sql` se genera con `tools/generar_docs.py` desde `docs/arquitectura/datos/`; si cambian roles o permisos, se genera una migración nueva con la diferencia.
