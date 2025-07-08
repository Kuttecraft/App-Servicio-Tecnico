# ℹ️ info.md

## Herramientas para migración y análisis de datos

Esta carpeta contiene scripts auxiliares para la migración, limpieza y análisis de los datos históricos del proyecto **App Servicio Técnico - Kuttecraft**.

---

### Scripts disponibles

- **`extraer_ultimas_50_columnas.py`**  
  Toma un archivo CSV y genera uno nuevo solo con las últimas 50 columnas.  
  Útil para trabajar solo con la porción más reciente o relevante del historial de datos original.

---

### ¿Cómo usar los scripts?

1. **Instalar Python 3.x y la librería pandas**  
   (si no la tenés, ejecutar en terminal):
   ```bash
   pip install pandas
      ```

2. **Copiar el archivo CSV original** a esta carpeta (`/tools`).

3. **Editar el script** si necesitás cambiar los nombres de archivo de entrada/salida.

4. **Ejecutar el script** así:

   ```bash
   python extraer_ultimas_50_columnas.py
   ```

5. El archivo resultante se generará en la misma carpeta.

---

### Notas

* Guardá aquí todos los scripts relacionados a migración, análisis y limpieza de datos.
* Documentá cada script en esta misma sección a medida que sumes herramientas nuevas.
* Si hacés scripts para análisis (por ejemplo: contar valores vacíos, analizar campos únicos, etc.), documentalos aquí.

---

- Autor  [`Santiago Llamosas`](https://github.com/Llamosas21)
    - **Última actualización:** 2025-07-09
