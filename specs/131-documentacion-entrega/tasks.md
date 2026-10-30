# 131. Tareas

- [ ] T01 · S2 · R · Diagrama ER, arquitectura, RBAC y privacidad para el avance
  - Cubre: FR-131-02
  - Depende de: ninguna
  - Hecho cuando: `docs/arquitectura` contiene los cuatro documentos revisados
- [ ] T02 · S2 · R · README raíz con instalación de las tres plataformas
  - Cubre: FR-131-01
  - Depende de: 120-T01, 121-T01, 122-T01, 100-T08
  - Hecho cuando: escenario 1 pasa con un compañero
  - Avance 29-oct-2026: `README.md` raíz, `api/README.md`, `web/README.md` (ahora con `npm ci`) y `android/README.md` documentan requisitos, tabla de variables de entorno (nombre, secreta, origen; sin valores reales), base de datos y semilla sin `supabase db push`, ejecución, pruebas y entorno demo. Comandos revisados contra los `package.json`, `build.gradle.kts` y `.env.example`; `npm test -- --ci` en `api/` pasa (14 suites, 181 pruebas). **Sigue abierta**: el escenario 1 exige que un compañero levante las tres plataformas desde una máquina limpia, y no se pudo comprobar aquí (Android e iOS no se compilaron). Faltan además `ios/README.md` revisado contra el README raíz y el comando único de restauración del entorno demo (FR-131-05).
- [ ] T03 · S2 · R · Enlace de Figma y sistema de diseño en la documentación
  - Cubre: FR-131-03
  - Depende de: ninguna
  - Hecho cuando: el enlace está en el README y en el documento
- [ ] T04 · S5 · R · Script de restauración del entorno demo
  - Cubre: FR-131-05
  - Depende de: 130-T04
  - Hecho cuando: el entorno se reconstruye en un comando y la demo funciona
- [ ] T05 · S5 · R · Documento de arquitectura en PDF
  - Cubre: FR-131-02, FR-131-06
  - Depende de: T01
  - Hecho cuando: el PDF incluye todo lo de FR-131-02 con diagramas legibles
- [ ] T06 · S5 · R · Guion y ensayo de la defensa
  - Cubre: FR-131-04
  - Depende de: T04
  - Hecho cuando: dos ensayos completos sin fallos en 15 minutos


## Verificación del corte 0.3.0 · 24-oct-2026

Arquitectura actualizada a Node.js, ER anotado por alcance, matriz RBAC generada y privacidad técnica revisada. Figma diferido por el usuario. Las tareas cuyo criterio necesita nube, dispositivo, simulador, CI remoto o la siguiente sincronización de Figma permanecen abiertas. Las verificaciones del 17-oct son históricas y no se revalidaron en la nube.
