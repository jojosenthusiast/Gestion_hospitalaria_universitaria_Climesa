# Portal web CLIMESA

Primer flujo funcional: un administrador inicia sesión, invita a un paciente y el paciente establece su contraseña desde el enlace recibido por correo.

## Ejecutar desde VS Code

```powershell
cd web
Copy-Item .env.example .env
npm install
npm run dev
```

Abrir `http://localhost:5173`. El backend debe estar ejecutándose en el puerto 3000.

La ruta de aceptación es `http://localhost:5173/aceptar-invitacion` y debe estar autorizada en Supabase Authentication > URL Configuration > Redirect URLs.
