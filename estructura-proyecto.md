# 📦 Estructura del Proyecto - App Servicio Técnico

Este proyecto fue creado con Astro y utiliza tecnologías complementarias como:

- Node.js (para backend local a través de /api)
- Clerk (para autenticación de usuarios)
- Bootstrap (para diseño responsivo)

```batch 
## 🗂 Estructura de carpetas

/src
│
├── /components                  # Componentes reutilizables (tarjetas, barra lateral, etc.)
│   ├── PrinterCard.astro        # Componente visual para mostrar una impresora o equipo
│   ├── Sidebar.astro            # Componente para la barra de navegación lateral
│   └── Topbar.astro             # Componente para la barra superior
│
├── /layouts
│   └── BasePrivateLayout.astro  # Layout base para áreas privadas con Clerk + Bootstrap
│
├── /lib
│   └── clerk.ts                 # Configuración centralizada de Clerk: apariencia, idioma y helpers
│
├── /pages                       # Páginas principales del sitio
│   ├── index.astro              # Página raíz, redirige automáticamente a /signin
│   ├── dashboard.astro          # Panel principal del usuario (requiere sesión activa)
│   ├── signin.astro             # Página de inicio de sesión (<SignIn /> de Clerk)
│   ├── signup.astro             # Página de registro (<SignUp /> de Clerk)
│   └── /detalle
│       └── [id].astro           # Página dinámica con detalle según `id` y datos de `/data`
│
├── /data
│   └── impresoras.json          # Datos ficticios de impresoras y clientes
│
├── /styles
│   └── Custom.css                # Estilos base para trabajar a lo largo de la web 
│
├── /types
│   ├── clerk.d.ts               # Tipado personalizado para Clerk (ej. window.Clerk)
│   └── env.d.ts                 # Tipado para variables de entorno (`import.meta.env`)
│
├── middleware.ts                # Middleware para proteger rutas privadas


---
📁 OTRAS CARPETAS IMPORTANTES

/public
├── styles/                    # Archivos CSS estáticos globales (si se usan)
│   └── login.css              # Estilos base para login o páginas públicas
├── logo.svg                   # Icono/logo de la app
├── img/                       # Imágenes visibles por URL directa
└── printer-placeholder.svg    # Imagen por defecto para impresoras

/.astro                        # Archivos generados por Astro (NO EDITAR)
/node_modules                  # Dependencias instaladas por npm (NO EDITAR)

```

## 📄 Archivos raíz importantes

Archivo                 | Descripción
------------------------|-----------------------------------------------------------
astro.config.ts         | Configuración principal de Astro y Clerk
tsconfig.json           | Configuración de TypeScript
package.json            | Dependencias, scripts y metadata del proyecto
package-lock.json       | Registro exacto de versiones instaladas
.gitignore              | Archivos/carpetas que Git debe ignorar
.env.example            | Plantilla de variables de entorno necesarias para ejecutar el proyecto
README.md               | Información general del proyecto
estructura-proyecto.txt | Este archivo: explica toda la organización del código

---

## ✅ Buenas prácticas

- Usar **componentes modulares** y legibles
- Centralizar lógica en `/lib/`
- No dejar lógica en páginas si puede extraerse
- Mantener el código limpio y comentado
- Actualizar `.env.example` al agregar nuevas variables

---

## 🔜 Futuras ampliaciones

- CRUD completo de clientes, tickets y técnicos
- Sistema de notificaciones por email
- Exportación de informes
- Generación automática de etiquetas o fichas técnicas

---

📌 Mantené este archivo actualizado si hacés cambios importantes en la estructura o convenciones del proyecto.