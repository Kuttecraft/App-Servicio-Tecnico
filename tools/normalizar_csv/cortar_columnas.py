import os
import pandas as pd
from utils.consola import limpiar_consola

def cortar_columnas_csv():
    limpiar_consola()
    print("\n=== Cortar y exportar columnas de un CSV ===\n")
    entrada = input("Ingrese la ruta absoluta del archivo CSV: ").strip()
    if not os.path.isfile(entrada):
        print(f"\nEl archivo {entrada} no existe.")
        input("Presione ENTER para volver al menú...")
        return

    df = pd.read_csv(entrada, encoding='utf-8')
    print("\nColumnas disponibles:")
    for i, col in enumerate(df.columns):
        print(f"{i+1}. {col}")

    nombre = input("\nNombre del archivo a crear (sin .csv): ").strip()
    seleccion = input("Ingrese los NÚMEROS de las columnas a usar, separados por coma (ej: 1,3,5): ").strip()
    try:
        indices = [int(x.strip())-1 for x in seleccion.split(',') if x.strip().isdigit()]
        columnas_seleccionadas = [df.columns[i] for i in indices]
    except Exception as e:
        print("Error en los índices ingresados. Inténtalo de nuevo.")
        input("Presione ENTER para volver al menú...")
        return

    df_nuevo = df[columnas_seleccionadas]
    nuevo_csv = f"{nombre}.csv"
    df_nuevo.to_csv(nuevo_csv, index=False)
    print(f"\nArchivo creado: {nuevo_csv} con columnas: {', '.join(columnas_seleccionadas)}")
    input("Presione ENTER para volver al menú...")
