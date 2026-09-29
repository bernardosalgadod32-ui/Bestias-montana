# Bestias de montaña

App móvil de trail running con Next.js 15.5.9 y Supabase (Auth, PostgreSQL y Storage). Mantiene la estética negra/blanca y las pestañas Inicio, Agenda, Rutas, Retos, Team y Perfil.

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

## Retos mensuales

Coaches y administradores pueden publicar retos de kilómetros, minutos, desnivel positivo, salidas o hábitos. Cada reto tiene fechas, reglas, meta individual, meta colectiva opcional y validación opcional del coach. Se crea un reto nuevo cada mes; el historial queda disponible en Perfil. Las metas publicadas son inmutables y un reto puede archivarse.

Los miembros se unen y registran actividades realizadas dentro del periodo, hasta la fecha de cierre en la zona horaria del equipo. No se suma la asistencia automáticamente ni existe sincronización con relojes o Strava. Solo las actividades aceptadas cuentan para clasificación, progreso y medallas; un coach no puede validar sus propios registros. La revisión puede continuar después del cierre.

La evidencia opcional (JPG, PNG o WebP, máximo 10 MB) solo puede descargarse por el autor y los coaches de su equipo. Las cantidades y notas son visibles para el equipo. Eliminar un registro recalcula el progreso; retirar a un miembro elimina sus participaciones y registros de ese equipo mediante las claves foráneas de membresía.

Antes de desplegar esta versión, aplicar `supabase/migrations/202609290001_monthly_challenges.sql` después de las migraciones anteriores. Crea tablas con RLS, funciones de mutación acotadas y el bucket privado `challenge-evidence`. No necesita claves secretas en el cliente. Las pruebas ejecutan la migración real en PostgreSQL embebido y comprueban permisos, fechas, idempotencia, revisión y revocación de acceso.
