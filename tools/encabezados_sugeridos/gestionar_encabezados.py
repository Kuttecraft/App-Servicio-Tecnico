import os
import pandas as pd
from utils.consola import limpiar_consola

def obtener_y_ver_encabezados():
    limpiar_consola()
    print("=== Obtener y visualizar encabezados del CSV ===\n")
    archivo = input("Ingrese la ruta completa del archivo CSV: ").strip()
    if not os.path.isfile(archivo):
        print("El archivo no existe en la ruta especificada. Intente de nuevo.")
        input("ENTER para volver al menú...")
        return None
    df = pd.read_csv(archivo, nrows=0)
    columnas = list(df.columns)
    df_sugerencia = pd.DataFrame({
        'columna_original': columnas,
        'columna_normalizada': columnas
    })
    print("\nPreview de encabezados detectados:\n")
    print(df_sugerencia)
    path_guardado = input("\nRuta para guardar encabezados sugeridos (ENTER para usar 'sugerencia_columnas.csv'): ").strip()
    if not path_guardado:
        path_guardado = 'sugerencia_columnas.csv'
    df_sugerencia.to_csv(path_guardado, index=False)
    print(f"\nEncabezados detectados guardados en '{path_guardado}'.")
    input("\nENTER para volver...")
    return path_guardado

def ver_encabezados_csv():
    limpiar_consola()
    print("=== Ver archivo de encabezados ===\n")
    ruta = input("Ruta del archivo CSV de encabezados a visualizar: ").strip()
    if not os.path.isfile(ruta):
        print("Archivo no encontrado.")
        input("ENTER para volver al menú...")
        return
    df = pd.read_csv(ruta)
    print("\nPreview de encabezados:\n")
    print(df.to_string(index=False))
    input("\nENTER para volver...")

def generar_estructura_desde_csv():
    limpiar_consola()
    print("=== Generar estructura de tablas desde CSV de definición ===\n")
    path_tablas = input("Ruta al CSV con la lista de nombres de tablas: ").strip()
    if not os.path.isfile(path_tablas):
        print("Archivo no encontrado.")
        input("ENTER para volver...")
        return
    tablas_df = pd.read_csv(path_tablas)
    if 'nombre_tabla' not in tablas_df.columns:
        print("El CSV de tablas debe tener la columna 'nombre_tabla'.")
        input("ENTER para volver...")
        return
    tablas = list(tablas_df['nombre_tabla'])
    path_columnas = input("Ruta al CSV master de columnas (nombre_tabla,columna): ").strip()
    if not os.path.isfile(path_columnas):
        print("Archivo no encontrado.")
        input("ENTER para volver...")
        return
    columnas_df = pd.read_csv(path_columnas)
    for tabla in tablas:
        colname = 'columna_normalizada' if 'columna_normalizada' in columnas_df.columns else 'columna'
        cols = list(columnas_df[columnas_df['nombre_tabla'] == tabla][colname])
        if not cols:
            print(f"No hay columnas definidas para la tabla: {tabla}")
            continue
        output_dir = os.path.join('csv', 'tablas')
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f'{tabla}.csv')
        pd.DataFrame(columns=cols).to_csv(output_path, index=False)
        print(f"Tabla '{tabla}': columnas {cols}")
        print(f"Archivo generado: {output_path}\n")
    input("\nENTER para volver al menú de encabezados...")

def cortar_columnas_csv():
    limpiar_consola()
    print("=== Cortar y exportar columnas a un nuevo CSV ===\n")
    csv_datos = input("Ruta al archivo CSV de datos original: ").strip()
    if not os.path.isfile(csv_datos):
        print("Archivo de datos no encontrado.")
        input("ENTER para volver...")
        return
    csv_encabezados = input("Ruta al archivo CSV de encabezados (columna_normalizada o columna): ").strip()
    if not os.path.isfile(csv_encabezados):
        print("Archivo de encabezados no encontrado.")
        input("ENTER para volver...")
        return
    df_datos = pd.read_csv(csv_datos)
    df_headers = pd.read_csv(csv_encabezados)
    col_field = 'columna_normalizada' if 'columna_normalizada' in df_headers.columns else 'columna'
    columnas = [c for c in df_headers[col_field] if c in df_datos.columns]
    if not columnas:
        print("No se encontraron columnas válidas para cortar.")
        input("ENTER para volver...")
        return
    df_datos_filtrado = df_datos[columnas]
    output_path = input("Ruta para guardar el CSV filtrado: ").strip()
    df_datos_filtrado.to_csv(output_path, index=False)
    print(f"Archivo guardado en: {output_path}")
    input("\nENTER para volver...")

def copiar_csv_por_tablas():
    limpiar_consola()
    print("=== Copiar CSV original en archivos separados por tabla con datos reales ===\n")
    ruta_datos = input("Ruta al archivo CSV de datos original: ").strip()
    if not os.path.isfile(ruta_datos):
        print("❌ Archivo de datos no encontrado.")
        input("ENTER para volver...")
        return
    ruta_salida = input("Carpeta donde guardar los CSV por tabla: ").strip()
    os.makedirs(ruta_salida, exist_ok=True)
    ruta_mapeo = input("Ruta al archivo CSV con el mapeo (nombre_tabla,columna): ").strip()
    if not os.path.isfile(ruta_mapeo):
        print("❌ Archivo de mapeo no encontrado.")
        input("ENTER para volver...")
        return
    df_datos = pd.read_csv(ruta_datos)
    df_mapeo = pd.read_csv(ruta_mapeo)
    if 'nombre_tabla' not in df_mapeo.columns or 'columna' not in df_mapeo.columns:
        print("❌ El archivo de mapeo debe tener las columnas: 'nombre_tabla' y 'columna'.")
        input("ENTER para volver...")
        return
    tablas = df_mapeo['nombre_tabla'].unique()
    for tabla in tablas:
        columnas = [col for col in df_mapeo[df_mapeo['nombre_tabla'] == tabla]['columna'] if col in df_datos.columns]
        if not columnas:
            print(f"⚠️ No se encontraron columnas válidas para la tabla '{tabla}'.")
            continue
        df_tabla = df_datos[columnas]
        output_path = os.path.join(ruta_salida, f"{tabla}.csv")
        df_tabla.to_csv(output_path, index=False)
        print(f"✅ Tabla '{tabla}' guardada en '{output_path}' con columnas: {columnas}")
    input("\nProceso completo. ENTER para volver al menú...")
