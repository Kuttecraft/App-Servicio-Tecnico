# ⚙ App Servicio Técnico - Kuttecraft

Este proyecto tiene como objetivo **migrar flujos actuales que usan Google Sheets, Google Forms, AppScript y AppSheet** a una aplicación web moderna, capaz de correr **de forma local en servidores propios**.

Su propósito principal es permitir un **seguimiento eficiente de productos ingresados a reparación**, así como la **gestión de usuarios, arreglos, presupuestos** y más.

---

## 🚀 Tecnologías utilizadas

- **Astro** Framework moderno basado en componentes para el desarrollo frontend.
- **Bootstrap** Sistema de diseño responsive para una interfaz adaptable.
- **Clerk** Servicio de autenticación para la gestión completa de usuarios (registro, login, sesiones, redirecciones) [`Referencia.`](https://clerk.com/) 
- **Supabase** Backend como servicio que proporciona base de datos PostgreSQL, autenticación, almacenamiento y funciones serverless. [`Referencia.`](https://supabase.com) 
- **Node.js** Motor para la lógica de backend. Actualmente se usa en endpoints locales dentro de `/api`, y está previsto como base para una migración futura a un backend propio más robusto.


---

## 📦 Cómo ejecutar el proyecto localmente

### 1. Clonar el repositorio

```batch 
git clone https://github.com/Kuttecraft/App-Servicio-Tecnico.git
cd App-Servicio-Tecnico
```

### 2. Instalar dependencias
```batch 
npm install
```

### 3. Configurar entorno 

- Crear un archivo `.env` y ver [`.env.example`](./.env.example) 

```env
# 🔐 CLAVES DE CLERK 
PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...           # Solo necesaria para funciones protegidas en el backend

# 🔑 CLAVES DE SUPABASE
PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1...

# 🌐 OPCIONALES DE ASTRO
PUBLIC_CLERK_SIGN_IN_URL=/ingreso
PUBLIC_CLERK_SIGN_UP_URL=/registro
```

### 4. 🚀 Iniciar el servidor de desarrollo
```batch 
npm run dev -- --host
```

## 📁 Documentación de estructura

La estructura interna del código está documentada en:

📄 [`estructura-proyecto.md`](./estructura-proyecto.md)

Incluye detalles de carpetas, archivos clave, buenas prácticas y planes de escalabilidad.

## 👤 Autor

- Fecha de inicio: **22/05/2025**
- Proyecto creado por  [`Santiago Llamosas`](https://github.com/Llamosas21)
- Desarrollador Frontend Principal  [`JuanPabloLucio`](https://github.com/JuanPabloLucio)


---

## 🤝 Contribuciones

- Este es un proyecto **público**, abierto a ideas, mejoras y colaboración.  
    - Si querés contribuir, podés abrir un **issue** o enviar un **pull request**.

---

## 📝 Licencia

Actualmente sin licencia explícita. Puede usarse para aprendizaje o como base para proyectos similares.  
Se agregará una licencia formal más adelante.

---
