import os
import pandas as pd
from utils.consola import limpiar_consola, print_tabla

def obtener_filas():
    """
    Extrae las primeras o últimas N filas de un CSV y las guarda en un nuevo archivo.
    """
    limpiar_consola()
    while True:
        archivo = input("\nIngrese la **ruta completa** del archivo CSV a convertir: ").strip()
        if not os.path.isfile(archivo):
            print("El archivo no existe en la ruta especificada. Intente de nuevo.")
        else:
            break

    df = pd.read_csv(archivo)

    while True:
        try:
            cantidad = int(input("¿Cuántas filas desea extraer?: "))
            if cantidad <= 0:
                print("Ingrese un número mayor a cero.")
            else:
                break
        except ValueError:
            print("Por favor, ingrese un número válido.")

    while True:
        print("¿Desde dónde desea extraer las filas?")
        print("1. Desde el principio (primeras N filas)")
        print("2. Desde el final (últimas N filas)")
        modo = input("Seleccione una opción (1 o 2): ").strip()
        if modo in ['1', '2']:
            break
        else:
            print("Opción inválida.")

    nombre_salida = input("Ingrese el nombre del archivo de salida (debe tener .csv): ").strip()
    if not nombre_salida:
        nombre_salida = "salida.csv"

    if cantidad > df.shape[0]:
        print("La cantidad supera las filas disponibles. Se extraerán todas.")
        cantidad = df.shape[0]

    if modo == '1':
        resultado = df.iloc[:cantidad, :]
    else:
        resultado = df.iloc[-cantidad:, :]

    limpiar_consola()
    print("\nVista previa de las filas extraídas (primeras 5 filas):\n")
    print_tabla(resultado, max_filas=5)
    print(f"\nFilas: {resultado.shape[0]}, Columnas: {resultado.shape[1]}\n")

    input("Presione ENTER para guardar el archivo...")

    salida_path = os.path.join(os.getcwd(), nombre_salida)
    resultado.to_csv(salida_path, index=False)

    limpiar_consola()
    print(f"\n¡Archivo guardado como '{nombre_salida}' en:\n{salida_path}\n")
    print(f"({resultado.shape[0]} filas, {resultado.shape[1]} columnas)")
