contenido = """
# 📦 Estructura del Proyecto - App Servicio Técnico

Este proyecto fue creado con Astro y utiliza tecnologías complementarias como:

- Node.js (para backend local a través de /api)
- Clerk (para autenticación de usuarios)
- Bootstrap (para diseño responsivo)
- JSON como base de datos local simulada

```batch 
## 🗂 Estructura de carpetas

/src
│
├── /pages                 # 📄 Páginas principales del sitio web
│   ├── index.astro        # Página de inicio
│   ├── login.astro        # Login de usuario
│   ├── dashboard.astro    # Página principal tras login
│   └── /api               # 🌐 Endpoints tipo backend (Node.js dentro de Astro)
│       ├── login.ts       # POST - Simulación de login de usuario
│       ├── clientes.ts    # CRUD básico de clientes
│       └── ...            # Otros endpoints (estadísticas, servicios, etc.)
│
├── /components            # 🧩 Componentes reutilizables de UI
│   ├── Header.astro       # Encabezado de la app
│   ├── Sidebar.astro      # Menú lateral (en desktop)
│   ├── ClienteCard.astro  # Tarjeta para mostrar datos del cliente
│   └── Formulario.astro   # Formulario para alta o edición
│
├── /layouts               # 🖼 Layouts generales
│   ├── BaseLayout.astro   # Estructura base con header/sidebar
│   └── AuthLayout.astro   # Layout usado en páginas como login/registro
│
├── /lib                   # 🔧 Funciones auxiliares
│   ├── db.ts              # Lectura y escritura de archivo JSON (clientes, servicios, etc.)
│   └── auth.ts            # Funciones de ayuda para autenticación local o Clerk

---

## 🗂 Otras carpetas importantes

/public
    ├── logo.png              # Logo de la app
    ├── img/                  # Imágenes públicas
    └── ...                   # Archivos estáticos accesibles por URL directa

/.astro                      # Carpeta generada por Astro (NO TOCAR)
/node_modules                # Dependencias del proyecto (NO TOCAR)

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
