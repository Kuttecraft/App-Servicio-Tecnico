## Kuttecraft Tools CSV — Migración y Análisis de Datos

Esta carpeta contiene utilidades Python para la **migración, limpieza y análisis** de datos históricos y actuales del proyecto **App Servicio Técnico - Kuttecraft**.

---

### **Requisitos**

- Python 3.9 o superior
- Instalar dependencias (recomendado: en un entorno virtual):

```bash
pip install -r requirements.txt
```

**requirements.txt** contiene:
```bash
numpy==2.3.1
pandas==2.3.1
python-dateutil==2.9.0.post0
pytz==2025.2
six==1.17.0
tabulate==0.9.0
tzdata==2025.2
```

---
## Estructura de Carpetas
```bash
KuttecraftToolsCSV/
│
├── main.py
│
├── obtener_datos/
│     ├── obtener_columnas.py
│     ├── obtener_filas.py
│     ├── obtener_estadisticas.py
│
├── gestionar_encabezados/
│     ├── gestionar_encabezados.py
│
├── utils/
│     ├── consola.py
│
├── csv/
│    ├── .gitkeep
│    ├── Tablas/
│    │    ├── .gitkeep
│    ├── Analisis/
│         ├── .gitkeep
│
└── tablas.csv   # (opcional: si usás definición dinámica de tablas)

```

### **Scripts principales**

#### `main.py` (menú multifunción, modular)
Funcionalidades principales:

Funcionalidades:

1. **Obtener columnas**  
   Extrae columnas específicas de un CSV (por posición, desde el principio o final).

2. **Obtener filas**  
   Extrae filas específicas de un CSV (desde el principio o final).

3. **Gestión de encabezados y tablas**  
   - Visualizar y guardar encabezados de un CSV
   - Ver archivos de encabezados
   - Generar estructura de tablas desde CSV de definición
   - Cortar y exportar columnas a un nuevo CSV
   - Copiar CSV original en archivos separados por tabla con datos reales

4. **Obtener estadísticas básicas**  
   Muestra tipo de dato, nulos, % nulos, valores únicos y ejemplos para cada columna.

5. **Integración automática de nuevas funciones**  
   Fácil de agregar nuevas herramientas: solo sumar la función y agregarla al menú.

6. **Modularidad y expansión fácil**  
   Cada función está separada en su módulo; podés sumar scripts nuevos agregando archivos y enlazando en el menú.

---


### **¿Cómo usar el menú principal?**

1. Asegurate de tener todos los paquetes instalados (`pip install -r requirements.txt`)
2. Ejecutá el script con:

    ```bash
    python main.py
    ```

3. Seguí las instrucciones en pantalla.

---


### **Notas para desarrolladores / futuros usuarios**

- No se suben archivos de datos reales.
Solo .gitkeep para mantener la estructura en el repo.

- Todos los scripts guardan archivos de salida en la estructura /csv según corresponda (o en raíz si no hay carpeta).

- Si agregás funcionalidades nuevas, creá un archivo Python en la carpeta correspondiente y sumalo al menú en main.py.

- Si agregás dependencias, no olvides actualizar requirements.txt.

- El sistema limpia la consola automáticamente y muestra tablas amigables usando tabulate.

- Podés definir las tablas dinámicamente con tablas.csv si querés una arquitectura aún más flexible.

---


### **Autor**
- [`Santiago Llamosas`](https://github.com/Llamosas21)
- **Última actualización:** 15/7/2025

