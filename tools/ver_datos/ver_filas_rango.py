import os 
import pandas as pd 
from utils.consola import limpiar_consola, print_tabla

def ver_filas_rango():
    """
    Permite ver un rango específico de filas (de N a M) del CSV.
    """
    limpiar_consola()
    archivo = input("\nIngrese la **ruta completa** del archivo CSV para ver filas: ").strip()
    if not os.path.isfile(archivo):
        print("El archivo no existe en la ruta especificada.")
        input("ENTER para volver al menú...")
        return
    df = pd.read_csv(archivo)
    total_filas = df.shape[0]
    print(f"\nEl archivo tiene {total_filas} filas.")
    while True:
        try:
            inicio = int(input("Ingrese la fila de inicio (0 para la primera): "))
            fin = int(input(f"Ingrese la fila de fin (máximo {total_filas-1}): "))
            if 0 <= inicio <= fin < total_filas:
                break
            else:
                print("Rango fuera de límites.")
        except ValueError:
            print("Ingrese números válidos.")

    limpiar_consola()
    print(f"\nMostrando filas {inicio} a {fin}:\n")
    print_tabla(df.iloc[inicio:fin+1])
    print(f"\nTotal de columnas: {df.shape[1]}\n")
    input("Presione ENTER para volver al menú...")
