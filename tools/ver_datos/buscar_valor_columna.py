import os 
import pandas as pd
from utils.consola import limpiar_consola, print_tabla  
def buscar_valor_columna():
    """
    Permite buscar un valor dentro de una columna específica y muestra las filas coincidentes.
    """
    limpiar_consola()
    archivo = input("\nIngrese la **ruta completa** del archivo CSV: ").strip()
    if not os.path.isfile(archivo):
        print("El archivo no existe en la ruta especificada.")
        input("ENTER para volver al menú...")
        return
    df = pd.read_csv(archivo)
    print("\nColumnas disponibles:")
    for idx, col in enumerate(df.columns):
        print(f"{idx}: {col}")
    try:
        idx_col = int(input("Seleccione el número de columna a buscar: "))
        columna = df.columns[idx_col]
    except Exception:
        print("Selección inválida.")
        input("ENTER para volver al menú...")
        return
    valor = input(f"Valor a buscar en columna '{columna}': ").strip()
    encontrados = df[df[columna].astype(str).str.contains(valor, na=False, case=False)]
    if encontrados.empty:
        print("No se encontraron coincidencias.")
    else:
        print(f"\nFilas encontradas con '{valor}' en '{columna}':\n")
        print_tabla(encontrados)
        print(f"\nTotal: {encontrados.shape[0]} coincidencias.")
    input("ENTER para volver al menú...")
