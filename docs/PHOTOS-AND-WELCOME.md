# Fotos por entrenamiento y guía de bienvenida

## Cambios
- Álbum dentro del detalle de cada entrenamiento, incluidos los anteriores de Agenda.
- Cualquier miembro puede subir hasta 10 fotos por carga, JPG/PNG/WebP de hasta 10 MB cada una.
- Descarga del archivo original y menú nativo para compartir; cuando no se admite compartir archivos, se descarga la foto para publicarla desde la red social.
- Galería paginada de 12 fotos, carga parcial con errores por archivo y botón Actualizar.
- El autor puede eliminar sus fotos; coaches y administradores pueden moderar el álbum.
- Bucket privado y políticas de acceso vinculadas a la membresía del equipo y al entrenamiento.
- Guía de cinco pasos en la primera visita del navegador/dispositivo, con Omitir, Atrás y Siguiente. Puede volver a abrirse desde Perfil o desde la pantalla para unirse a un equipo.
- La guía no aparece automáticamente durante enlaces de autenticación o recuperación de contraseña.

## Activación
1. Aplicar `supabase/migrations/202609240001_training_photos.sql` en el proyecto Supabase existente, después de las dos migraciones anteriores. El script crea únicamente la tabla, el bucket y las políticas de fotos; no elimina datos existentes.
2. Publicar la versión de Next.js con las variables públicas de Supabase ya usadas por la app. No usar claves service-role en el frontend.
3. Probar con dos cuentas del mismo equipo: subir una foto, actualizar el álbum desde la segunda cuenta, descargar y compartir. Probar también una cuenta ajena al equipo.
4. Comprobar Compartir en iOS/Android reales: las aplicaciones de destino dependen del sistema operativo y de las apps instaladas. No se publica automáticamente en ninguna red.

La migración debe aplicarse antes de publicar el frontend. La app consultará la tabla nueva al abrir el álbum o eliminar un entrenamiento.

## Pruebas
`pnpm test` ejecuta pruebas existentes más validación de fotos, RLS de PostgreSQL mediante PGlite, flujo de galería con cliente simulado y navegación/persistencia de la guía mediante JSDOM. `pnpm build` comprueba compilación y tipos.

Las pruebas de galería simulan Storage. No sustituyen la verificación con dos cuentas en Supabase real, ni una prueba de compartir en un teléfono.

## Operación
La eliminación de un entrenamiento borra primero sus fotos mediante Storage API y luego sus registros. La clave foránea impide borrar la sesión si aún hay fotos registradas. Los errores permiten reintentar. Si una carga sube el archivo pero falla el registro, se intenta limpiar el archivo; si también falla la limpieza se informa al usuario. Conviene revisar archivos huérfanos tras interrupciones de red o cierre abrupto de la app durante una carga. Nunca borrar filas de `storage.objects` directamente para limpiar archivos: utilizar Storage API.

La galería conserva archivos originales en memoria durante la página actual para permitir compartir con un toque. Cada página contiene un máximo de 12 fotos; las URLs temporales se liberan al salir o cambiar de página. El álbum requiere conexión. La guía guarda su estado en este navegador, no en la cuenta.
