import os
import tabulate
import pandas as pd
from utils.consola import limpiar_consola, print_tabla


def obtener_estadisticas_basicas():
    """
    Muestra estadísticas básicas de cada columna del CSV:
    - Tipo de dato, nulos, % nulos, valores únicos, top 3 ejemplos.
    """
    limpiar_consola()
    archivo = input("Ingrese la ruta del CSV a analizar: ").strip()
    if not os.path.isfile(archivo):
        print("El archivo no existe.")
        input("ENTER para volver al menú...")
        return
    df = pd.read_csv(archivo)
    resumen = []
    for col in df.columns:
        total = len(df)
        nulos = df[col].isnull().sum()
        unicos = df[col].nunique(dropna=True)
        tipo = df[col].dtype
        ejemplo = df[col].dropna().unique()[:3]
        resumen.append([col, tipo, total, nulos, f"{100*nulos/total:.2f}%", unicos, ejemplo])
    print(tabulate(resumen, headers=['Columna', 'Tipo', 'Filas', 'Nulos', '%Nulos', 'Únicos', 'Ejemplo']))
    pd.DataFrame(resumen, columns=['Columna', 'Tipo', 'Filas', 'Nulos', '%Nulos', 'Únicos', 'Ejemplo']).to_csv("analisis_basico.csv", index=False)
    print("\nResumen guardado en analisis_basico.csv")
    input("ENTER para volver al menú...")
