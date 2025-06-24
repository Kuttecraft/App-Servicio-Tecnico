# 📦 Estructura del Proyecto - App Servicio Técnico

Este proyecto fue creado con Astro y utiliza tecnologías complementarias como:

- Node.js (para backend local a través de /api)
- Clerk (para autenticación de usuarios)
- Bootstrap (para diseño responsivo)

```batch 
📁 Estructura de carpetas


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
│   ├── clientes.astro            # (pendiente) vista para gestión de técnicos/clientes
│   ├── estadisticas.astro        # (pendiente) panel con métricas
|   |
│   ├── /detalle/
│   │   └── [id].astro            # Vista dinámica de detalle del ticket y poder eliminar en caso de ser necesario
|   |
│   ├── /editar/
│   │   └── [id].astro            # Vista dinámica del ticket para editar
│   │
│   └── /api/
│       ├── crearTicket.ts        # Endpoint POST para crear un ticket (modo servidor)
│       └── actualizarTicket.ts   # Endpoint POST para editar un ticket (modo servidor)
│       └── eliminarTicket.ts     # Endpoint POST para eliminar un ticket (modo servidor)
│
├── /data
│   └── impresoras.json           # Datos de ejemplo para pruebas (mock)
│
├── /styles
│   └── Custom.css                # Estilos personalizados (Bootstrap + overrides)
│
├── /types
│   ├── astro.d.ts                # Extensiones de tipos de Astro (ej: locals.user)
│   ├── clerk.d.ts                # Tipado de `window.Clerk`, etc.
│   └── env.d.ts                  # Tipos para las variables de entorno

├── middleware.ts                 # Middleware global para proteger rutas privadas

---
📁 OTRAS CARPETAS IMPORTANTES

/public
├── logo.svg                     # Icono principal de la aplicación
├── img/                         # Imágenes públicas accesibles por URL
├── logo.svg                     # Imagen por defecto para impresoras
└── eliminar.png                 # Imagen dedicada a elimnar un ticket (Uilizado en /detalle/[id].astro)

/.astro                          # Archivos generados automáticamente por Astro (NO EDITAR)
/node_modules                    # Dependencias instaladas por npm (NO EDITAR)

```

## 📄 Archivos raíz importantes

Archivo                 | Descripción
------------------------|-----------------------------------------------------------
astro.config.ts         | Configuración de Astro. Actualmente usa output: 'server' con @astrojs/node.
tsconfig.json           | Configuración de TypeScript
package.json            | Dependencias, scripts y metadata del proyecto
package-lock.json       | Registro exacto de versiones instaladas
.gitignore              | Archivos/carpetas que Git debe ignorar
.env.example            | Plantilla de variables de entorno necesarias para ejecutar el proyecto
README.md               | Información general del proyecto
estructura-proyecto.txt | Este archivo: explica toda la organización del código

---

## ✅ Buenas prácticas

- Usar **componentes modulares**, legibles y reutilizables diidir en `/components` que puedan combinarse y mantenerse fácilmente.
- Centralizar lógica en `/lib/` 
- No dejar lógica en páginas si puede extraerse
- Mantener el código limpio y comentado
- Actualizar `.env.example` al agregar nuevas variables

---

## 🔜 Futuras ampliaciones

- Buscar la forma de comprimir la imagen para poder almacenarla en la base de supabase
- Mejorar los tiempos de carga
- Exportación de informes
- Generación de estadísticas apartir de lso datos de la base 

---

📌 Mantené este archivo actualizado si hacés cambios importantes en la estructura o convenciones del proyecto.
