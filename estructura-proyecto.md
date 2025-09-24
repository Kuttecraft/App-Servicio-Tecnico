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
├─ /components
│  ├─ DeliveryForm.astro                    # Subformulario de Delivery (cobrado, medio, costo, info)
│  ├─ PresupuestoForm.astro                 # Subformulario de Presupuesto (monto, link, garantía, notas)
│  ├─ PrinterCard.astro                     # Card para listar/mostrar una impresora/equipo
│  ├─ Sidebar.astro                         # Sidebar de navegación (privada)
│  └─ Topbar.astro                          # Barra superior (perfil/sesión)
│
├─ /data
│  └─ impresoras.json                       # Semillas/listado estático de modelos (si aplica)
│
├─ /layouts
│  └─ BasePrivateLayout.astro               # Layout base para vistas privadas (incluye estilos, navbar, etc.)
│
├─ /lib
│  ├─ clerk.ts                              # Configuración de Clerk (i18n, apariencia)
│  ├─ resolverAutor.ts                      # 🔑 Resuelve/crea el técnico actual y da nombre para comentarios
│  ├─ supabase.ts                           # Cliente compartido de Supabase
│  └─ utils.ts                              # Utilidades (fechas, formato moneda, etc.)
│
├─ /pages
│  ├─ addTicket.astro                       # Alta de ticket (form)
│  ├─ dashboard.astro                       # Panel de inicio (widgets/atajos)
│  ├─ estadisticas-tecnico.astro            # Métricas filtradas por técnico
│  ├─ estadisticas.astro                    # Métricas generales
│  ├─ index.astro                           # Redirección / landing (normalmente a /signin)
│  ├─ no-autorizado.astro                   # Acceso denegado
│  ├─ signin.astro                          # Login (Clerk)
│  ├─ signup.astro                          # Registro (Clerk)
│  ├─ usuarios.astro                        # ABM de usuarios/permisos
│  │
│  ├─ /comentarios
│  │  └─ [id].astro                         # Vista del historial de comentarios del ticket
│  │
│  ├─ /delivery
│  │  └─ [id].astro                         # Vista/info del delivery asociado a un ticket
│  │
│  ├─ /detalle
│  │  └─ [id].astro                         # Detalle del ticket (con acciones)
│  │
│  ├─ /editar
│  │  └─ [id].astro                         # Edición del ticket (form grande)
│  │
│  ├─ /presupuesto
│  │  └─ [id].astro                         # Gestión/visualización del presupuesto del ticket
│  │
│  └─ /api                         
│     ├─ agregarComentario.ts               # POST: agrega comentario (uso en vista y en automatizaciones)
│     ├─ actualizarDelivery.ts              # POST: upsert de delivery
│     ├─ actualizarPermisosUsuarios.ts      # POST: permisos en usuarios_perfil
│     ├─ actualizarPresupuesto.ts           # POST: upsert de presupuesto + estado "P. Enviado"
│     ├─ actualizarTicket.ts                # POST: edita ticket + diffs → comentario automático
│     ├─ crearTicket.ts                     # POST: crea ticket (y relaciones iniciales)
│     ├─ eliminarTicket.ts                  # POST: elimina ticket
│     ├─ estadisticas-tecnico.ts            # GET/POST: datos/series por técnico
│     ├─ estadisticas.ts                    # GET/POST: datos/series globales
│     ├─ listarTecnicos.ts                  # GET: lista técnica derivada de usuarios_perfil (crea faltantes)
│     ├─ maquinaLista.ts                    # POST: marca estado “Lista” (y lo que corresponda)
│     └─ proximoTicket.ts                   # GET: sugiere próximo número
│
├─ /styles
│  └─ custom.css                            # Estilos personalizados (incluye .comentario { white-space: pre-line })
│
└─ middleware.ts                            # Middleware de rutas (auth/roles, redirect, etc.)


├─ /types
│  ├─ astro.d.ts                            # Extensiones de tipos para Astro.locals (perfil, user, etc.)
│  └─ env.d.ts                              # Tipado de variables de entorno (Supabase, Clerk, etc.)
```

## 📁 OTRAS CARPETAS IMPORTANTES
```batch 

/public
├── img/                                    # Imágenes públicas accesibles por URL (fotos de impresoras, usuarios, etc.)
├── logo.webp                               # Logo principal de la aplicación (formato webp, imagen optimizada)
|
├── scripts/                                # Scripts JavaScript vanilla para formularios y lógica del frontend
│   ├── form-actualizar-filtro.js           # Convierte el filtro "q" en input de texto o dropdown de estados con color.
│   ├── form-ampliar-imagen.js              # Visor fullscreen de la imagen principal con zoom, cierre y doble click/tap.
│   ├── form-crar-ticket-multi.js           # Maneja carga múltiple de imágenes al crear ticket (principal, ticket, extra) con compresión WebP.
│   ├── form-crear-ticket.js                # Comprime la imagen al crear un ticket (convierte a WebP antes de enviar).
│   ├── form-detalle-galeia.js              # Cambia la imagen principal desde miniaturas en detalle (click o teclado, con cache-buster).
│   ├── form-editar-equipo.js               # Permite reemplazar, eliminar o comprimir la imagen de un ticket existente. Controla la UI/UX.
│   ├── form-galeria.js                     # Galería pública: miniaturas → imagen principal, con activo y cache-buster.
│   ├── form-mas-imagenes.js                # En edición: reemplaza, elimina o previsualiza imágenes (principal, ticket, extra).
│   └── formUser-eliminar-user.js   # Gestiona la alerta y flujo de eliminación de usuarios en la gestión de permisos.  
|
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