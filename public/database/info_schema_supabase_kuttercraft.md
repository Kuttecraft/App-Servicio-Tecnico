# Descripción general

Este documento describe la estructura y relaciones principales de la base de datos del proyecto **App Servicio Técnico - Kuttecraft** en su versión relacional.
Las tablas están **normalizadas** y cada entidad importante tiene su propia tabla, mejorando la escalabilidad y trazabilidad respecto al modelo anterior (única tabla principal).


## Tabla: clientes

Guarda los datos personales y de contacto de cada cliente.

| Campo                           | Tipo         | Descripción                     |
| ------------------------------- | ------------ | ------------------------------- |
| `id`                            | BIGSERIAL    | Identificador único del cliente |
| `cliente`                       | VARCHAR(100) | Nombre completo o razón social  |
| `nombre`                        | VARCHAR(100) | Nombre del cliente              |
| `apellido`                      | VARCHAR(100) | Apellido del cliente            |
| `dni_cuit`                      | VARCHAR(60)  | DNI o CUIT                      |
| `whatsapp`                      | VARCHAR(60)  | Número de contacto              |
| `correo_electronico`            | VARCHAR(100) | Dirección de correo electrónico |
| `direccion`                     | VARCHAR(255) | Domicilio                       |
| `localidad`                     | VARCHAR(100) | Ciudad o localidad              |
| `informacion_adicional_usuario` | TEXT         | Notas extra sobre el cliente    |

## Tabla: tecnicos
Registra los datos de cada técnico del taller.

| Campo       | Tipo         | Descripción                     |
| ----------- | ------------ | ------------------------------- |
| `id`        | BIGSERIAL    | Identificador único del técnico |
| `nombre`    | VARCHAR(100) | Nombre del técnico              |
| `apellido`  | VARCHAR(100) | Apellido del técnico            |
| `email`     | TEXT         | Correo electrónico              |
| `activo`    | TEXT         | Estado ("true"/"false")         |
| `creado_en` | TEXT         | Fecha/hora de alta (en texto)   |


## Tabla: impresoras
Representa a cada impresora registrada para reparación o seguimiento.
| Campo                | Tipo         | Descripción                   |
| -------------------- | ------------ | ----------------------------- |
| `id`                 | BIGSERIAL    | Identificador de la impresora |
| `modelo`             | VARCHAR(100) | Modelo de la impresora        |
| `maquina`            | VARCHAR(100) | Número o código interno       |
| `numero_de_serie`    | VARCHAR(100) | Número de serie               |
| `tamano_de_boquilla` | VARCHAR(80)  | Tamaño de la boquilla         |


## Tabla principal: tickets
Cada registro representa un ticket/caso de servicio técnico.
Está vinculado a un cliente, un técnico y una impresora.

| Campo                 | Tipo      | Descripción                                       |
| --------------------- | --------- | ------------------------------------------------- |
| `id`                  | BIGSERIAL | Identificador del ticket                          |
| `cliente_id`          | BIGINT    | Referencia a `cliente(id)`                        |
| `tecnico_id`          | BIGINT    | Referencia a `tecnicos(id)` (nullable)            |
| `impresora_id`        | BIGINT    | Referencia a `impresoras(id)` (nullable)          |
| `marca_temporal`      | TEXT      | Fecha de creación del ticket                      |
| `ticket`              | BIGINT    | Número interno del ticket                         |
| `notas_del_cliente`   | TEXT      | Notas registradas por el cliente                  |
| `notas_del_tecnico`   | TEXT      | Comentarios del técnico asignado                  |
| `fecha_de_reparacion` | TEXT      | Fecha de reparación en formato texto              |
| `estado`              | TEXT      | Estado del ticket ("Ingresado", "Reparado", etc.) |
| `dias_en_taller`      | TEXT      | Tiempo en días que permaneció                     |
| `maquina_reparada`    | TEXT      | Indicador (texto) si la máquina fue reparada      |
| `devolver_maquina`    | TEXT      | Indicador (texto) si se devuelve la máquina       |
| `imagen`              | TEXT      | Link o nombre de archivo de imagen asociada       |


- *Relaciones y reglas*:

    - No se puede eliminar un cliente con tickets asociados (ON DELETE RESTRICT).

    - Si se elimina un técnico o impresora, el ticket queda con campo NULL (ON DELETE SET NULL).

## Tabla: presupuestos
Registra los presupuestos realizados por cada ticket.

| Campo                  | Tipo      | Descripción                                      |
| ---------------------- | --------- | ------------------------------------------------ |
| `id`                   | BIGSERIAL | Identificador del presupuesto                    |
| `ticket_id`            | BIGINT    | Referencia a `tickets_mian(id)`                  |
| `componentes`          | TEXT      | Componentes presupuestados (formato texto/plano) |
| `precio_componente`    | TEXT      | Precios de cada componente                       |
| `enviar_presupuesto`   | TEXT      | Indica si fue enviado                            |
| `presupuesto`          | TEXT      | Detalle del presupuesto                          |
| `link_presupuesto`     | TEXT      | Enlace al archivo/pdf                            |
| `presupuesto_aprobado` | TEXT      | Si fue aprobado (texto, ej. "Si", "No")          |
| `garantia_activa`      | TEXT      | Si está dentro de garantía                       |
| `notas_administracion` | TEXT      | Comentarios administrativos                      |
| `monto`                | TEXT      | Monto total del presupuesto                      |


- *Reglas*:
    - Si se elimina un ticket, se eliminan automáticamente sus presupuestos (ON DELETE CASCADE).

## Tabla: delivery
Gestión de entregas y pagos relacionados a cada ticket.

| Campo                            | Tipo      | Descripción                                 |
| -------------------------------- | --------- | ------------------------------------------- |
| `id`                             | BIGSERIAL | Identificador de entrega                    |
| `ticket_id`                      | BIGINT    | Referencia a `tickets_mian(id)`             |
| `cotizar_delivery`               | TEXT      | Si corresponde cotizar (texto)              |
| `informacion_adicional_delivery` | TEXT      | Detalles adicionales                        |
| `medio_de_entrega`               | TEXT      | Modo de entrega (retiro, motomensajería...) |
| `fecha_de_entrega`               | TEXT      | Fecha estimada o real de entrega            |
| `forma_de_pago`                  | TEXT      | Método de pago                              |
| `pagado`                         | TEXT      | Si se registró el pago                      |

- *Reglas*:
    - Si se elimina un ticket, se elimina automáticamente el delivery relacionado (ON DELETE CASCADE).

## Tabla: usuarios_permisos
Gestiona los permisos y accesos de cada usuario/técnico en el sistema.

| Campo          | Tipo      | Descripción                          |
| -------------- | --------- | ------------------------------------ |
| `id`           | BIGSERIAL | Identificador                        |
| `tecnico_id`   | BIGINT    | Referencia a `tecnicos(id)`          |
| `rol`          | TEXT      | Rol del usuario ("tecnico", "admin") |
| `dashboard`    | TEXT      | Permite acceso al dashboard (Sí/No)  |
| `tickets`      | TEXT      | Permite ver tickets                  |
| `usuarios`     | TEXT      | Permite gestionar usuarios           |
| `estadisticas` | TEXT      | Permite ver estadísticas             |
| `creado_en`    | TEXT      | Fecha de creación                    |

- *Reglas*:
    - Si se elimina un técnico, se eliminan todos sus permisos (ON DELETE CASCADE).

## Relaciones clave e integridad referencial

- Un ticket siempre debe estar asociado a un cliente.
- Los tickets pueden quedar sin técnico o impresora si estos se eliminan.
- No pueden existir presupuestos o entregas sin su ticket correspondiente.
- Los permisos de usuario siempre están ligados a un técnico.

## Recomendaciones

- Usar tipos booleanos para flags y switches.
- Mantener los nombres de campo en snake_case y sin espacios.
- Registrar aquí cualquier cambio o ampliación futura (por ejemplo, historial de cambios, archivos adjuntos, múltiples técnicos por ticket, etc).

## Última actualización
- **Fecha:** 2025-08-05  
- **Responsable:** Santiago Llamosas y Juan Pablo Lucio