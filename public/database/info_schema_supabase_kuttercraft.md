# Descripción general

Este documento describe la estructura y relaciones principales de la base de datos del proyecto **App Servicio Técnico - Kuttecraft** en su versión relacional.
Las tablas están **normalizadas** y cada entidad importante tiene su propia tabla, mejorando la escalabilidad y trazabilidad respecto al modelo anterior (única tabla principal).


## Tabla: clientes

Guarda los datos personales y de contacto de cada cliente.

| Campo                           | Tipo         | Descripción                                 |
| ------------------------------- | ------------ | ------------------------------------------- |
| `id`                            | serial       | Identificador único del cliente             |
| `nombre`                        | varchar(100) | Nombre del cliente                          |
| `apellido`                      | varchar(100) | Apellido del cliente                        |
| `dni_cuit`                      | varchar(30)  | DNI o CUIT (único)                          |
| `whatsapp`                      | varchar(30)  | WhatsApp de contacto                        |
| `mail`                          | varchar(100) | Dirección de correo electrónico (campo 1)   |
| `correo_electronico`            | varchar(100) | Dirección de correo electrónico (campo 2)   |
| `direccion`                     | varchar(255) | Domicilio                                   |
| `localidad`                     | varchar(100) | Ciudad o localidad                          |
| `informacion_adicional_usuario` | text         | Notas extra o aclaraciones sobre el cliente |

## Tabla: tecnicos
Registra los datos de cada técnico del taller.

| Campo       | Tipo         | Descripción                       |
| ----------- | ------------ | --------------------------------- |
| `id`        | serial       | Identificador del técnico         |
| `nombre`    | varchar(100) | Nombre del técnico                |
| `apellido`  | varchar(100) | Apellido del técnico              |
| `email`     | text         | Email único del técnico           |
| `activo`    | boolean      | Estado (habilitado/deshabilitado) |
| `creado_en` | timestamptz  | Fecha/hora de alta en el sistema  |

## Tabla: impresoras
Representa a cada impresora registrada para reparación o seguimiento.
| Campo                | Tipo         | Descripción                   |
| -------------------- | ------------ | ----------------------------- |
| `id`                 | serial       | Identificador de la impresora |
| `modelo`             | varchar(100) | Modelo de la impresora        |
| `maquina`            | varchar(100) | Nombre o número de la máquina |
| `numero_de_serie`    | varchar(100) | N° de serie (único)           |
| `tamano_de_boquilla` | varchar(50)  | Tamaño de la boquilla         |

## Tabla principal: tickets
Cada registro representa un ticket/caso de servicio técnico.
Está vinculado a un cliente, un técnico y una impresora.

| Campo                 | Tipo        | Descripción                                       |
| --------------------- | ----------- | ------------------------------------------------- |
| `id`                  | serial      | Identificador único del ticket                    |
| `cliente_id`          | integer     | Referencia a `clientes.id`                        |
| `tecnico_id`          | integer     | Referencia a `tecnicos.id` (puede ser NULL)       |
| `impresora_id`        | integer     | Referencia a `impresoras.id` (puede ser NULL)     |
| `marca_temporal`      | timestamp   | Fecha y hora de creación del ticket               |
| `notas_del_cliente`   | text        | Notas escritas por el cliente                     |
| `notas_del_tecnico`   | text        | Notas escritas por el técnico                     |
| `fecha_de_reparacion` | date        | Fecha de la reparación                            |
| `estado`              | varchar(50) | Estado del ticket ("Ingresado", "Reparado", etc.) |
| `dias_en_taller`      | integer     | Días que estuvo el equipo en el taller            |
| `maquina_reparada`    | boolean     | Indicador si el trabajo fue realizado             |
| `devolver_maquina`    | boolean     | Si corresponde devolver la máquina                |

- *Relaciones y reglas*:

    - No se puede eliminar un cliente con tickets asociados (ON DELETE RESTRICT).

    - Si se elimina un técnico o impresora, el ticket queda con campo NULL (ON DELETE SET NULL).

## Tabla: presupuestos
Registra los presupuestos realizados por cada ticket.

| Campo                  | Tipo       | Descripción                                         |
| ---------------------- | ---------- | --------------------------------------------------- |
| `id`                   | serial     | Identificador único                                 |
| `ticket_id`            | integer    | Referencia a `tickets.id`                           |
| `componentes`          | text\[]    | Lista de componentes presupuestados                 |
| `precio_componente`    | numeric\[] | Lista de precios correspondientes a cada componente |
| `enviar_presupuesto`   | boolean    | Si el presupuesto fue enviado                       |
| `presupuesto`          | text       | Detalle/explicación del presupuesto                 |
| `link_presupuesto`     | text       | Link a archivo/pdf del presupuesto                  |
| `monto`                | numeric    | Monto total                                         |
| `presupuesto_aprobado` | boolean    | Si fue aprobado por el cliente                      |
| `garantia_activa`      | boolean    | Si la reparación está en garantía                   |
| `notas_administracion` | text       | Notas administrativas adicionales                   |

- *Reglas*:
    - Si se elimina un ticket, se eliminan automáticamente sus presupuestos (ON DELETE CASCADE).

## Tabla: delivery
Gestión de entregas y pagos relacionados a cada ticket.

| Campo                            | Tipo         | Descripción                                |
| -------------------------------- | ------------ | ------------------------------------------ |
| `id`                             | serial       | Identificador único                        |
| `ticket_id`                      | integer      | Referencia a `tickets.id`                  |
| `cotizar_delivery`               | boolean      | Si corresponde cotizar el delivery         |
| `informacion_adicional_delivery` | text         | Detalles/observaciones adicionales         |
| `medio_de_entrega`               | varchar(100) | Cómo se entregará (motomensajería, retiro) |
| `fecha_de_entrega`               | date         | Fecha prevista de entrega                  |
| `forma_de_pago`                  | varchar(100) | Método de pago                             |
| `pagado`                         | boolean      | Si el pago se realizó                      |

- *Reglas*:
    - Si se elimina un ticket, se elimina automáticamente el delivery relacionado (ON DELETE CASCADE).

## Tabla: usuarios_permisos
Gestiona los permisos y accesos de cada usuario/técnico en el sistema.

| Campo          | Tipo        | Descripción                                |
| -------------- | ----------- | ------------------------------------------ |
| `id`           | serial      | Identificador único                        |
| `tecnico_id`   | integer     | Referencia a `tecnicos.id`                 |
| `rol`          | text        | Rol del usuario ("tecnico", "admin", etc.) |
| `dashboard`    | boolean     | Permiso para acceder al panel principal    |
| `tickets`      | boolean     | Permiso para ver/gestionar tickets         |
| `usuarios`     | boolean     | Permiso para gestionar usuarios            |
| `estadisticas` | boolean     | Permiso para ver estadísticas              |
| `creado_en`    | timestamptz | Fecha de alta de este permiso/acceso       |

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
- **Fecha:** 2025-07-09  
- **Responsable:** Santiago Llamosas