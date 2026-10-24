# ADR-0008. Despliegue y perfiles

**Estado:** Aceptada (17-oct-2026). Decisiones: D-020, D-064.

| Perfil | Base de datos | API | Clientes |
|---|---|---|---|
| Curso | Supabase en la nube | Contenedor en Azure App Service (Azure for Students); respaldo Render o Railway | Web desplegada (Vercel o Azure Static Web Apps); Android APK; iOS en simulador o dispositivo desde Mac universitaria |
| Producción CLIMESA | PostgreSQL en servidor propio del hospital o Supabase autoalojado, con réplica | Servidor en el hospital | Igual; distribución interna |

La producción en la nube exige evaluar transferencia internacional de datos de salud (LPDP Art. 44-45) y contrato con el proveedor (Norma 1616 Art. 65). El código no cambia entre perfiles; cambian variables de entorno y configuración.
