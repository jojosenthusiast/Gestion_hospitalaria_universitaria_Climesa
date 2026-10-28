# Contrato de la API

`openapi.json` es el contrato que consumen web, Android e iOS. Lo genera la API (`npm run api:generate --prefix api`) y se actualiza en el mismo PR que cambia un endpoint:

```bash
npm ci --prefix api
npm run api:generate --prefix api
```

Nunca se edita a mano. Mientras la API no exista (antes de 100-T08), la referencia es `docs/arquitectura/datos/endpoints.csv`.
