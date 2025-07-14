# Descripción general

## ⚠️ ATENCIÓN

- Este archivo documenta la estructura de las tablas originales utilizadas en el proyecto App Servicio Técnico - Kuttecraft, principalmente durante la primera fase del sistema y en la migración inicial desde Google Sheets/AppSheet.

- A partir de la implementación del modelo relacional, este esquema deja de estar en uso activo y ha sido reemplazado por la nueva estructura normalizada, definida en el archivo
schema_supabase_kuttercraft.sql.

- Se mantiene esta documentación por motivos históricos, para referencia, o en caso de consultas sobre datos legados.

Aquí se detallan los campos de la tabla principal utilizada anteriormente, el propósito de cada uno y algunas recomendaciones realizadas antes de la migración.



## Tabla principal: `TestImpresoras`

Esta tabla almacena los datos principales de cada equipo o ticket ingresado al servicio técnico.

| Campo                    | Tipo                   | Descripción                                                                |
|--------------------------|------------------------|----------------------------------------------------------------------------|
| `id`                     | uuid                   | Identificador único (autogenerado)                                         |
| `ticket`                 | bigint                 | Número de ticket/secuencia para el seguimiento                             |
| `estado`                 | text                   | Estado actual del equipo/ticket ("Ingresado", "En reparación", etc)        |
| `cliente`                | text                   | Nombre del cliente                                                         |
| `modelo`                 | text                   | Modelo del equipo                                                          |
| `fechaFormulario`        | timestamp tz           | Fecha y hora de alta del ticket                                            |
| `notaTecnico`            | text                   | Notas del técnico a cargo                                                  |
| `notaAdmin`              | text                   | Notas administrativas (internas, no técnicas)                              |
| `comentarios`            | text                   | Comentarios adicionales, observaciones generales                           |
| `tecnico`                | text                   | Nombre del técnico asignado                                                |
| `cubreGarantia`          | text                   | Indica si cubre garantía ("Sí"/"No", puede migrar a boolean)               |
| `notaInterna`            | text                   | Notas internas adicionales                                                 |
| `linkPresupuesto`        | text                   | Link externo a presupuesto PDF o Google Drive                              |
| `monto`                  | bigint                 | Monto estimado/presupuestado                                               |
| `costoDelivery`          | text                   | Información sobre el costo de delivery                                     |
| `infoDelivery`           | text                   | Información adicional sobre la entrega/recepción                           |
| `dniCuit`                | bigint                 | DNI o CUIT del cliente                                                     |
| `whatsapp`               | text                   | WhatsApp de contacto del cliente                                           |
| `correo`                 | text                   | Email de contacto del cliente                                              |
| `cobrado`                | boolean                | Indica si el trabajo fue cobrado (true/false)                              |
| `timestampPresupuesto`   | timestamp tz           | Fecha de creación/envío del presupuesto                                    |
| `timestampListo`         | timestamp tz           | Fecha en que el equipo quedó listo para entregar                           |
| `imagen`                 | text                   | URL o nombre de archivo de la foto principal del equipo                    |

**Notas sobre campos de tiempo:**  
Los timestamps (`fechaFormulario`, `timestampPresupuesto`, `timestampListo`) provienen de la lógica heredada de AppSheet y marcan los diferentes estados del proceso:  
- **fechaFormulario**: alta del ticket  
- **timestampPresupuesto**: presupuesto generado  
- **timestampListo**: reparación finalizada/lista para entregar

---

## Tabla de usuarios: `usuarios_perfil`

Controla los permisos, roles y estado de cada usuario del sistema.

| Campo         | Tipo          | Descripción                                                   |
|---------------|---------------|---------------------------------------------------------------|
| `id`          | bigint        | Identificador interno                                         |
| `email`       | text          | Correo electrónico (único)                                    |
| `nombre`      | text          | Nombre real del usuario                                       |
| `rol`         | text          | Rol ("admin", "tecnico", etc)                                 |
| `dashboard`   | boolean       | Permiso para ver el panel principal                           |
| `tickets`     | boolean       | Permiso para ver/gestionar tickets                            |
| `usuarios`    | boolean       | Permiso para ver/gestionar usuarios                           |
| `estadisticas`| boolean       | Permiso para ver panel de estadísticas                        |
| `activo`      | boolean       | Si el usuario está habilitado                                 |
| `creado_en`   | timestamp tz  | Fecha de alta en el sistema                                   |

## Última actualización

- **Fecha:** 2025-07-09  
- **Responsable:** Santiago Llamosas

---
