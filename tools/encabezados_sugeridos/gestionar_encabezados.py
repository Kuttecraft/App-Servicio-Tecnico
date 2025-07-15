import os
import pandas as pd
from utils.consola import limpiar_consola

def obtener_y_guardar_encabezados():
    limpiar_consola()
    print("=== Obtener y guardar encabezados del CSV ===\n")
    archivo = input("Ingrese la **ruta completa** del archivo CSV: ").strip()
    if not os.path.isfile(archivo):
        print("El archivo no existe en la ruta especificada. Intente de nuevo.")
        input("ENTER para volver al menú...")
        return

    df = pd.read_csv(archivo, nrows=0)  # Sólo encabezados
    columnas = list(df.columns)
    df_sugerencia = pd.DataFrame({
        'columna_original': columnas,
        'columna_normalizada': columnas
    })
    df_sugerencia.to_csv('sugerencia_columnas.csv', index=False)
    print(f"\nEncabezados detectados guardados en 'sugerencia_columnas.csv' para que los edites o ajustes a gusto.\n")
    print(df_sugerencia)
    input("\nENTER para volver...")

def cargar_encabezados_personalizados():
    limpiar_consola()
    print("=== Cargar encabezados personalizados ===\n")
    ruta = input("Ingrese la ruta del archivo CSV de encabezados personalizados: ").strip()
    if not os.path.isfile(ruta):
        print("Archivo no encontrado.")
        input("ENTER para volver al menú...")
        return
    global encabezados_cargados
    df = pd.read_csv(ruta)
    if 'columna_normalizada' not in df.columns:
        print("El CSV debe tener la columna 'columna_normalizada'.")
        input("ENTER para volver al menú...")
        return
    encabezados_cargados = list(df['columna_normalizada'])
    print(f"\nEncabezados cargados correctamente ({len(encabezados_cargados)} columnas):")
    for col in encabezados_cargados:
        print("-", col)
    input("\nENTER para volver...")

def ver_encabezados_cargados():
    limpiar_consola()
    print("=== Ver encabezados actualmente cargados ===\n")
    global encabezados_cargados
    if encabezados_cargados:
        print("Encabezados cargados:")
        for col in encabezados_cargados:
            print("-", col)
    else:
        print("No hay encabezados cargados aún. Usá la opción anterior primero.")
    input("\nENTER para volver...")

# Variable global temporal para mantener los encabezados elegidos
encabezados_cargados = []
