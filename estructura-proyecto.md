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
│   ├── PrinterCard.astro         # Componente visual para mostrar un equipo
│   ├── Sidebar.astro             # Barra lateral de navegación
│   └── Topbar.astro              # Barra superior con sesión, etc.
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
│   ├── /detalle/
│   │   └── [id].astro            # Vista dinámica de detalle del ticket (con opción de eliminar)
│   │
│   ├── /editar/
│   │   └── [id].astro            # Vista dinámica para editar un ticket
│   │
│   ├── /delivery/
│   │   └── [id].astro            # Vista dinámica con información del delivery asociado a un ticket
│   │
│   ├── /presupuesto/
│   │   └── [id].astro            # Vista dinámica para ver/gestionar presupuestos de un ticket
│   │
│   └── /api/
│       ├── crearTicket.ts               # Endpoint POST para crear un ticket
│       ├── actualizarTicket.ts          # Endpoint POST para editar un ticket
│       ├── eliminarTicket.ts            # Endpoint POST para eliminar un ticket
│       ├── proximoTicket.ts             # Endpoint GET para sugerir el próximo número de ticket
│       ├── actualizarDelivery.ts        # Endpoint POST para actualizar los datos de un delivery (por id)
│       ├── actualizarPermisosUsuarios.ts# Endpoint POST para actualizar los permisos de un usuario (en 'usuarios_perfil')
│       └── actualizarPresupuesto.ts     # Endpoint POST para actualizar datos de presupuesto (por id, en 'TestImpresoras')
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
├── img/ # Imágenes públicas accesibles por URL (fotos de impresoras, usuarios, etc)
├── logo.svg # Logo principal de la aplicación (también como imagen por defecto)
|
├── scripts/ # Scripts JavaScript vanilla para formularios y lógica del frontend
|          | 
│          ├── formUser-eliminar-user.js # Gestiona la alerta y el flujo de eliminación de usuarios en la gestión de permisos.
│          ├── form-crear-ticket.js      # Comprime la imagen al crear un ticket. Si el usuario selecciona una imagen, la convierte a WebP optimizado antes de enviarla.
│          └── form-editar-equipo.js     # Permite reemplazar, eliminar o comprimir la imagen de un ticket existente. Controla la UI/UX
|
|/.astro # Archivos generados automáticamente por Astro (NO EDITAR)
|
|/node_modules # Dependencias instaladas por npm (NO EDITAR)

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

- Gestionar perfiles definir que puede o no ver un técnico.
- Generación de estadísticas a partir de datos de la base.



📌 **Mantené este archivo actualizado si hacés cambios importantes en la estructura o convenciones del proyecto.**
