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
│     ├── __init__.py
│     ├── obtener_columnas.py
│     ├── obtener_filas.py
│     ├── obtener_estadisticas.py
│
├── ver_datos/
│     ├── __init__.py
│     ├── ver_columnas.py
│     ├── ver_filas_rango.py
│     ├── buscar_valor_columna.py
│
├── normalizar_csv/
│     ├── __init__.py
│     ├── normalizar_encabezado.py
│     ├── normalizar_csv.py
│     ├── cortar_columnas.py
│
├── encabezados_sugeridos/
│     ├── __init__.py
│     ├── gestionar_encabezados.py
│
├── utils/
│     ├── __init__.py
│     ├── consola.py
│     ├── rutas.py
│     ├── estructura_csv.py
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

3. **Ver columnas del CSV**  
   Muestra los encabezados detectados.

4. **Normalizar encabezados de un CSV**  
   - Convierte todos los encabezados a *snake_case* sin tildes ni caracteres extraños, sin saltos de línea.
   - Convierte automáticamente a formato fecha/hora ISO para columnas con nombres tipo "fecha", "timestamp", etc.
   - Si una columna tiene números enteros en formato "436.0", los convierte a integer real para evitar errores en bases de datos tipo Postgres/Supabase.

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

