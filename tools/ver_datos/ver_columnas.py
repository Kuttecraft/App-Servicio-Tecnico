import os 
import pandas as pd 
from utils.consola import limpiar_consola, mostrar_banner

def ver_columnas():
    """
    Muestra la lista de columnas del CSV.
    """
    limpiar_consola()
    while True:
        archivo = input("\nIngrese la **ruta completa** del archivo CSV para ver sus columnas: ").strip()
        if not os.path.isfile(archivo):
            print("El archivo no existe en la ruta especificada. Intente de nuevo.")
        else:
            break
    df = pd.read_csv(archivo)
    print("\nColumnas detectadas:\n" + "="*40)
    for idx, col in enumerate(df.columns, 1):
        print(f"{idx:2d}. {col!r}")
    print("="*40)
    print(f"Total de columnas: {len(df.columns)}\n")
    input("Presione ENTER para volver al menú...")
