# 📦 Estructura del Proyecto - App Servicio Técnico

Este proyecto fue creado con Astro y utiliza tecnologías complementarias como:

- Node.js (para backend local a través de /api)
- Clerk (para autenticación de usuarios)
- Bootstrap (para diseño responsivo)
- Supabase (como base de datos y backend en la nube)


# 📁 Estructura de carpetas
```batch 


/src
│
├── /components
│   ├── DeliveryForm.astro        # Sección delivery del ticket
│   ├── PresupuestoForm.astro     # Sección presupuesto del ticket
│   ├── PrinterCard.astro         # Componente visual para mostrar un equipo
│   ├── Sidebar.astro             # Barra lateral de navegación
│   └── Topbar.astro              # Barra superior con sesión, etc.
│
├──/data
│   └── impresoras.json
│
├── /layouts
│   └── BasePrivateLayout.astro   # Layout base para vistas privadas (con Clerk + estilos)
│
├── /lib
│   ├── clerk.ts                  # Configuración visual y de idioma de Clerk
│   ├── supabase.ts               # Cliente global de Supabase (PostgreSQL)
│   └── utils.ts                  # Funciones útiles (formato, fechas, monedas)
│
├── /pages
│   ├── index.astro               # Redirección a /signin
│   ├── dashboard.astro           # Panel principal del usuario
│   ├── addTicket.astro           # Formulario para crear nuevos tickets
│   ├── signin.astro              # Página de ingreso (Clerk)
│   ├── signup.astro              # Registro de usuarios
│   ├── usuarios.astro            # Panel para agregar o quitar usuarios y permisos 
│   ├── estadisticas.astro        # Panel con métricas
│   ├── no-autorizado.astro       # Página de acceso denegado (usuarios sin permisos)
│   │
│   ├── /comentarios/
│   │   └── [id].astro            # Sección para comentar tickets
│   │
│   ├── /delivery/
│   │   └── [id].astro            # Vista dinámica con información del delivery asociado a un ticket
│   │
│   ├── /detalle/
│   │   └── [id].astro            # Vista dinámica de detalle del ticket (con opción de eliminar)
│   │
│   ├── /editar/
│   │   └── [id].astro            # Vista dinámica para editar un ticket
│   │
│   ├── /presupuesto/
│   │   └── [id].astro            # Vista dinámica para ver/gestionar presupuestos de un ticket
│   │
│   │  
│   └── /api/
│       ├── crearTicket.ts               # Endpoint POST para crear un ticket
│       ├── actualizarTicket.ts          # Endpoint POST para editar un ticket
│       ├── eliminarTicket.ts            # Endpoint POST para eliminar un ticket
│       ├── proximoTicket.ts             # Endpoint GET para sugerir el próximo número de ticket
│       ├── actualizarDelivery.ts        # Endpoint POST para actualizar los datos de un delivery (por id)
│       ├── actualizarPermisosUsuarios.ts# Endpoint POST para actualizar los permisos de un usuario (en 'usuarios_perfil')
│       ├── actualizarPresupuesto.ts     # Endpoint POST para actualizar datos de presupuesto (por id, en 'TestImpresoras')
│       ├── agregarComentario.ts         # Endpoint POST para crear un comentario 
│       ├── estadisticas.ts              # Endpoint POST para ver estadisticas  
│        └── maquinaLista.ts             # Endpoint POST para que marque como estado lista
│
├── /data
│   └── impresoras.json           # Datos de ejemplo para pruebas (mock)
│
├── /styles
│   └── custom.css                # Estilos personalizados (Bootstrap + overrides)
│
├── /types
│   ├── astro.d.ts                # Extensiones de tipos de Astro (ej: locals.user, email, authStatus, perfil)
│   └── env.d.ts                  # Tipos para las variables de entorno (PUBLIC_SUPABASE_URL, etc)
│
├── middleware.ts                 # Middleware global para proteger rutas privadas

```

## 📁 OTRAS CARPETAS IMPORTANTES
```batch 

/public
├── img/                          # Imágenes públicas accesibles por URL (fotos de impresoras, usuarios, etc.)
├── logo.webp                     # Logo principal de la aplicación (formato webp, imagen optimizada)
|
├── scripts/                      # Scripts JavaScript vanilla para formularios y lógica del frontend
│   ├── formUser-eliminar-user.js   # Gestiona la alerta y flujo de eliminación de usuarios en la gestión de permisos.
│   ├── form-crear-ticket.js        # Comprime la imagen al crear un ticket (convierte a WebP antes de enviar).
│   └── form-editar-equipo.js       # Permite reemplazar, eliminar o comprimir la imagen de un ticket existente. Controla la UI/UX.
|
/database
├── schema_supabase_kuttercraft.sql  # Esquema SQL **activo**: estructura actual y oficial de la base (Supabase/PostgreSQL, normalizada).
├── info_schema_supabase_kuttercraft.md # Documentación explicando campos, relaciones y convenciones del nuevo schema.
├── obsolete_schema_info.md           # Documentación de la **estructura anterior** (TestImpresoras), solo para referencia histórica.
├── schema_supabase.sql               # Respaldo genérico de estructuras SQL; usar sólo para casos de migración o referencia técnica.
|
/.astro                        # Archivos generados automáticamente por Astro (NO EDITAR)
 /node_modules                 # Dependencias instaladas por npm (NO EDITAR)


```
## 📄 Archivos raíz importantes

| Archivo                  | Descripción                                                             |
| ------------------------ | ----------------------------------------------------------------------- |
| `astro.config.ts`        | Configuración de Astro. Usa `output: 'server'` con `@astrojs/node`.     |
| `tsconfig.json`          | Configuración de TypeScript.                                            |
| `package.json`           | Dependencias, scripts y metadata del proyecto.                          |
| `package-lock.json`      | Registro exacto de versiones instaladas (lockfile de npm).              |
| `.gitignore`             | Archivos/carpetas que Git debe ignorar.                                 |
| `.env.example`           | Plantilla de variables de entorno necesarias para ejecutar el proyecto. |
| `README.md`              | Información general del proyecto.                                       |
| `estructura-proyecto.md` | Este archivo: explica toda la organización del código.                  |
| `/types`                 | Tipos TypeScript globales y de integraciones.                           |           |

## Buenas prácticas

- Usar **componentes modulares**, legibles y reutilizables en `/components` para poder combinarlos y mantenerlos fácilmente.
- Centralizar lógica en `/lib/`.
- No dejar lógica en páginas si puede extraerse.
- Mantener el código limpio y comentado.
- Actualizar `.env.example` al agregar nuevas variables.



## Futuras ampliaciones

- Generación de estadísticas a partir de datos de la base.
- Añadir filtros por maquina reparada archivadda y demas




📌 **Mantené este archivo actualizado si hacés cambios importantes en la estructura o convenciones del proyecto.**