"""
extraer_datos_de_csv.py

Este script toma un archivo CSV, extrae la cantidad de columnas finales que le indiques,
y genera un nuevo archivo con ese recorte. Es útil para migraciones o análisis de una porción
específica de datos históricos.

USO:
    python extraer_datos_de_csv.py <ruta_al_csv> <cantidad_columnas> [nombre_salida.csv]

EJEMPLOS:
    python extraer_datos_de_csv.py data.csv 50 salida.csv   # Extrae las últimas 50 columnas y guarda como salida.csv
    python extraer_datos_de_csv.py data.csv 10              # Extrae las últimas 10 columnas y guarda como salida.csv

El archivo de salida se genera en la misma carpeta donde está este script.

Si no tenés instalada la librería pandas, el script la instalará automáticamente.
"""


import sys
import os

# Verifica e instala pandas si no está disponible
try:
    import pandas as pd
except ImportError:
    print("El módulo pandas no está instalado. Instalando automáticamente...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pandas"])
    import pandas as pd

def main():
    if len(sys.argv) < 3:
        print("Uso: python extraer_datos_de_csv.py <ruta_al_csv> <cantidad_columnas> [nombre_salida.csv]")
        print("Ejemplo: python extraer_datos_de_csv.py data.csv 50 salida.csv")
        sys.exit(1)

    ruta_csv = sys.argv[1]
    cantidad = int(sys.argv[2])

    if not os.path.isfile(ruta_csv):
        print(f"El archivo {ruta_csv} no existe.")
        sys.exit(1)

    # Nombre de salida opcional
    if len(sys.argv) >= 4:
        salida = sys.argv[3]
    else:
        salida = "salida.csv"

    # Cargar el archivo CSV
    df = pd.read_csv(ruta_csv, encoding='utf-8')

    # Tomar las últimas N columnas (o todas si tiene menos)
    num_cols = df.shape[1]
    ultimas = df.iloc[:, -cantidad:] if num_cols >= cantidad else df

    # Guardar el archivo en la misma carpeta donde se corre el script
    salida_path = os.path.join(os.getcwd(), salida)
    ultimas.to_csv(salida_path, index=False, encoding='utf-8')

    print(f"Archivo guardado: {salida_path} ({ultimas.shape[0]} filas, {ultimas.shape[1]} columnas)")

if __name__ == "__main__":
    main()
