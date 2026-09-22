# Bestias de montaña

App móvil de trail running con Next.js 15.5.9 y Supabase (Auth, PostgreSQL y Storage). Mantiene la estética negra/blanca y las pestañas Inicio, Agenda, Rutas, Team y Perfil.

- Cuentas y perfiles; equipos con invitaciones y roles admin/coach/member.
- Coaches: crear, editar y eliminar entrenamientos y adjuntar rutas GPX.
- Miembros: confirmar/cancelar asistencia y consultar asistentes del equipo.
- Mapa Leaflet/OpenStreetMap, validación GPX, estadísticas y descarga privada.
- RLS y permisos Storage por equipo; pruebas de seguridad ejecutables.

Consulta [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) para activar Supabase/Vercel y validar con cuentas reales.

## Desarrollo

Node 24 y pnpm 11.19.0. Copia `.env.example` a `.env.local` y configura la clave **publishable**.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm dev
```

La migración inicial está en `supabase/migrations/202609210001_multiuser.sql`. No se utilizan contraseñas de base de datos ni claves service-role en la aplicación.
