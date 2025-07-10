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
pandas==2.3.1
tabulate==0.9.0
numpy==2.3.1
python-dateutil==2.9.0.post0
pytz==2025.2
six==1.17.0
tzdata==2025.2
```

---


### **Scripts principales**

#### `KuttecraftToolsCSV.py` (recomendado, menú multifunción)

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

---


### **¿Cómo usar el menú principal?**

1. Asegurate de tener todos los paquetes instalados (`pip install -r requirements.txt`)
2. Ejecutá el script con:

    ```bash
    python KuttecraftToolsCSV.py
    ```

3. Seguí las instrucciones en pantalla.

---


### **Notas para desarrolladores / futuros usuarios**

- Todos los archivos de salida se generan en la raíz del proyecto por defecto.
- Si hacés un script nuevo, documentalo debajo de esta línea y sumá la funcionalidad al menú del script principal.
- Si agregás más dependencias, **actualizá requirements.txt**.
- El código maneja automáticamente la limpieza de consola y la visualización amigable con `tabulate`.

---


### **Autor**
- [`Santiago Llamosas`](https://github.com/Llamosas21)
- **Última actualización:** 10/7/2025

