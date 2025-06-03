# ⚙ App Servicio Técnico - Kuttecraft

Este proyecto tiene como objetivo **migrar flujos actuales que usan Google Sheets, Google Forms, AppScript y AppSheet** a una aplicación web moderna, capaz de correr **de forma local en servidores propios**.

Su propósito principal es permitir un **seguimiento eficiente de productos ingresados a reparación**, así como la **gestión de usuarios, arreglos, presupuestos** y más.

---

## 🚀 Tecnologías utilizadas

- **Astro** (Frontend basado en componentes)
- **Node.js** (para lógica de backend simulada en `/api`)
- **Bootstrap** (para diseño responsive)
- **Clerk** (para autenticación real con cuentas de usuario)

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

### 3. Instalar dependencias de Clerk

Crear un archivo `.env` en la raíz del proyecto con tu clave pública de Clerk:

```env
PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### 4. 🚀 Iniciar el servidor de desarrollo
```batch 
npm run dev
```

---

## 📁 Documentación de estructura

La estructura interna del código está documentada en:

📄 [`estructura-proyecto.md`](./estructura-proyecto.md)

Incluye detalles de carpetas, archivos clave, buenas prácticas y planes de escalabilidad.

---

## 👤 Autor

- Proyecto creado por **Santiago Llamosas**
- Fecha de inicio: **22/05/2025**

---

## 🤝 Contribuciones

Este es un proyecto **público**, abierto a ideas, mejoras y colaboración.  
Si querés contribuir, podés abrir un **issue** o enviar un **pull request**.

---

## 📝 Licencia

Actualmente sin licencia explícita. Puede usarse para aprendizaje o como base para proyectos similares.  
Se agregará una licencia formal más adelante.

---
