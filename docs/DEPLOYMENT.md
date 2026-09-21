# Activación de Bestias de montaña

## 1. Supabase

Proyecto: `zjfzftxrtmuwuqwvrfnl`.

1. Abre [SQL Editor](https://supabase.com/dashboard/project/zjfzftxrtmuwuqwvrfnl/sql/new).
2. Revisa y ejecuta **una sola vez** `supabase/migrations/202609210001_multiuser.sql` completo. Es transaccional; si hay error no deja una instalación parcial. Está pensado para una base sin estas tablas; no elimina tablas existentes.
3. En Authentication → URL Configuration, configura Site URL como `https://bestias-montana.vercel.app` y añade esa URL y `http://localhost:3000` a Redirect URLs. Añade la URL exacta de cada preview que quieras usar para autenticación.
4. Mantén la confirmación de correo activada. Comprueba el proveedor Email y configura SMTP para el registro de miembros reales. El servicio de prueba de Supabase solo envía a direcciones pertenecientes al equipo propietario del proyecto; no permite abrir el registro al resto de la comunidad. Introduce la credencial SMTP directamente en Supabase, nunca en el repositorio ni en variables `NEXT_PUBLIC_*`. Desactiva el seguimiento de enlaces del proveedor si modifica los enlaces de confirmación. Consulta [SMTP en Supabase](https://supabase.com/docs/guides/auth/auth-smtp).
5. En API Keys, copia únicamente la clave **publishable**. No uses `secret`, `service_role` ni la contraseña de la base de datos.

La migración crea `profiles`, `teams`, `memberships`, `trainings`, `attendance`, `routes`, un esquema privado para invitaciones y un bucket GPX **privado** (5 MB). El trigger de `auth.users` crea perfiles; también incorpora usuarios anteriores si los hay. No asigna administradores automáticamente por email ni al primer visitante.

Si ejecutaste el SQL en el dashboard y posteriormente adoptas Supabase CLI, registra la versión `202609210001` como aplicada con `supabase migration repair 202609210001 --status applied` antes de `db push`. No vuelvas a ejecutar la migración.

## 2. Vercel / entorno local

Configura estas variables en el proyecto Vercel, para Production y las previews que vayas a probar:

```
NEXT_PUBLIC_SUPABASE_URL=https://zjfzftxrtmuwuqwvrfnl.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<clave publishable del dashboard>
```

Son valores públicos de cliente y quedan incluidos en el bundle. La autorización depende de RLS, no de ocultarlos. Mantén las claves fuera del repositorio. Copia `.env.example` a `.env.local` para desarrollo.

Tras configurarlas, haz un nuevo despliegue: Next.js incorpora estas variables **durante el build**. No basta reiniciar un deployment anterior. Si faltan, la app muestra una pantalla de preparación y no expone datos de ejemplo como si fueran reales.

Comandos (Node 24, pnpm 11.19.0):

```
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm dev
```

## 3. Primer equipo y validación real

1. Crea tu cuenta en la app y confirma el correo. Comprueba también la recepción en una dirección que no pertenezca al equipo del dashboard de Supabase, para verificar el SMTP real.
2. Pulsa «Crear mi equipo» con el nombre «Bestias de montaña». Esa transacción te asigna admin **solo del equipo que acabas de crear**.
3. En Team, genera una invitación. Caduca en 7 días; generar otra revoca la anterior. El código permite unirse como member, nunca como coach/admin.
4. Registra una segunda cuenta, únete con el código y promuévela a coach desde la cuenta admin.
5. Como coach, crea un entrenamiento, carga GPX, edita y verifica mapa y descarga. El editor indica la zona horaria del dispositivo; las agendas muestran la zona del equipo (America/Mexico_City).
6. Como miembro, confirma y cancela asistencia; comprueba que el coach ve el listado. La app actualiza datos cada 30 segundos cuando está visible y al recuperar el foco, excepto al editar formularios.
7. Crea un segundo equipo con otra cuenta y comprueba el aislamiento. Prueba también solicitudes directas fuera de la UI: RLS debe negar lectura/escritura de otros equipos.
8. Como coach, elimina un entrenamiento de prueba y comprueba que desaparezcan su ruta y confirmaciones.
9. Cierra sesión, solicita recuperación desde «Olvidé mi contraseña» y abre el enlace recibido. Debe aparecer el formulario de nueva contraseña antes del equipo, incluso al recargar. Guarda una contraseña nueva y comprueba que puedes volver a entrar. Escribe las contraseñas solo en la app.
10. Comprueba un enlace utilizado o vencido y el reenvío de confirmación. La app debe mostrar un mensaje claro y permitir solicitar otro correo, sin mostrar tokens ni detalles internos del proveedor.

## Seguridad y límites

- Cliente Supabase en navegador con sesión persistente y renovación del SDK. No hay páginas de datos privados renderizadas en servidor ni autorización basada en un botón de la UI.
- RLS controla todas las tablas públicas. Los miembros solo crean/eliminan su propia asistencia. Coaches y admins gestionan entrenamientos/GPX. Solo admins modifican roles mediante RPC; no se puede degradar al último admin.
- Las funciones con `security definer` fijan `search_path` vacío y comprueban `auth.uid()`. Los cambios de roles e invitaciones se serializan por equipo.
- Storage comprueba el equipo y el entrenamiento en la ruta `team/training/uuid.gpx`. No hay bucket público ni URLs permanentes de acceso anónimo.
- GPX se valida en el cliente como XML, con límites de tamaño/puntos/coordenadas y rechazo de entidades. Un coach que llame directamente a Storage puede subir bytes no válidos; todos los lectores vuelven a validar antes de mostrarlos. No se inyecta contenido GPX como HTML.
- Los mosaicos del mapa proceden de OpenStreetMap y requieren conexión; pueden fallar independientemente de la descarga GPX.
- Storage y PostgreSQL no comparten transacciones. El flujo compensa fallos de subida y borra el archivo antes del entrenamiento. Un fallo parcial, edición simultánea o eliminación directa vía API puede dejar archivos huérfanos; revisa Storage si ocurre. Los archivos de entrenamientos borrados no son legibles por la política.
- Los datos locales de la v1 no se importan automáticamente. Permanecen en el navegador anterior; publícalos como coach si quieres conservarlos en el equipo.
- Las pruebas de RLS usan PostgreSQL embebido (PGlite), con esquemas auth/storage mínimos que simulan la plataforma. No sustituyen la validación final contra Auth, Storage y correo del proyecto real.
