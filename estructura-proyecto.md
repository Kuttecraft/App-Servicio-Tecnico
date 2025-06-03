# 📦 Estructura del Proyecto - App Servicio Técnico

Este proyecto fue creado con Astro y utiliza tecnologías complementarias como:

- Node.js (para backend local a través de /api)
- Clerk (para autenticación de usuarios)
- Bootstrap (para diseño responsivo)

```batch 
## 🗂 Estructura de carpetas

/src
│
├── /pages                 # 📄 Páginas principales del sitio web
│   ├── index.astro        # Página raíz, puede redirigir a /signin
│   ├── signin.astro       # Página de login (Clerk)
│   ├── signup.astro       # Página de registro (Clerk)
│   └── middleware.ts      # Middleware opcional para rutas protegidas
│
├── /types                 # 📘 Tipos globales TypeScript
│   ├── clerk.d.ts         # Tipado para window.Clerk
│   └── env.d.ts           # Tipado para variables de entorno (import.meta.env)

---

## 🗂 Otras carpetas importantes

/public
├── styles/                # Archivos CSS globales separados (login.css, dashboard.css, etc.)
│   └── login.css
├── logo.png               # Logo de la app
├── img/                   # Imágenes públicas
└── ...                    # Archivos estáticos accesibles por URL directa

/.astro                    # Carpeta generada por Astro (NO TOCAR)
/node_modules              # Dependencias del proyecto (NO TOCAR)


```

## 📄 Archivos raíz importantes

Archivo              | Descripción
----------------------|-----------------------------------------------------------
astro.config.mjs     | Configuración del proyecto Astro
tsconfig.json        | Configuración de TypeScript
package.json         | Dependencias, scripts y metadata del proyecto
package-lock.json    | Registro exacto de versiones instaladas
.gitignore           | Archivos/carpetas que Git debe ignorar
README.md            | Información general del proyecto
estructura-proyecto.txt | Este archivo: explica toda la organización del código

---

## ✅ Buenas prácticas

- Usar componentes para mantener el código limpio y reutilizable.
- Centralizar layouts comunes (evita repetir header, sidebar, etc.).
- Documentar cada endpoint en /api con comentarios claros.
- Usar /lib para separar la lógica de negocio del renderizado.

---

## 🔜 Futuras ampliaciones

- Sustituir la autenticación simulada por Clerk.
- Migrar el almacenamiento de datos JSON a SQLite si el proyecto escala.
- Añadir validaciones del lado del cliente.

---

📌 Mantené este archivo actualizado si hacés cambios importantes en la estructura.
