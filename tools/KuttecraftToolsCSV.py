from tabulate import tabulate
import pandas as pd
import os
import unicodedata
import re

def limpiar_consola():
    if os.name == 'nt':
        os.system('cls')
    else:
        os.system('clear')

def mostrar_banner():
    print(r"")
    print(r"██╗  ██╗██╗   ██╗████████╗████████╗███████╗ ██████╗██████╗  █████╗ ███████╗████████╗")
    print(r"██║ ██╔╝██║   ██║╚══██╔══╝╚══██╔══╝██╔════╝██╔════╝██╔══██╗██╔══██╗██╔════╝╚══██╔══╝")
    print(r"█████╔╝ ██║   ██║   ██║      ██║   █████╗  ██║     ██████╔╝███████║█████╗     ██║   ")
    print(r"██╔═██╗ ██║   ██║   ██║      ██║   ██╔══╝  ██║     ██╔══██╗██╔══██║██╔══╝     ██║   ")
    print(r"██║  ██╗╚██████╔╝   ██║      ██║   ███████╗╚██████╗██║  ██║██║  ██║██║        ██║   ")
    print(r"╚═╝  ╚═╝ ╚═════╝    ╚═╝      ╚═╝   ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝        ╚═╝   ")
    print()

def menu_principal():
    limpiar_consola()
    mostrar_banner()
    print("1. Obtener columnas de un CSV")
    print("2. Obtener filas de un CSV")
    print("3. Ver columnas del CSV")
    print("4. Salir")
    print("5. Normalizar encabezados de un CSV")
    return input("\nIngrese una opción: ").strip()

def print_tabla(df, max_filas=5, max_columnas=8):
    cols = list(df.columns[:max_columnas])
    print(tabulate(df[cols].head(max_filas), headers='keys', tablefmt='github', showindex=False))
    if df.shape[1] > max_columnas:
        print(f"\n... ({df.shape[1] - max_columnas} columnas no mostradas)")
    if df.shape[0] > max_filas:
        print(f"... ({df.shape[0] - max_filas} filas no mostradas)")

def normalizar_encabezado(col):
    col = ''.join(
        c for c in unicodedata.normalize('NFD', col)
        if unicodedata.category(c) != 'Mn'
    )
    col = col.lower()
    col = re.sub(r"[\s\n]+", "_", col)
    col = re.sub(r"[^a-z0-9_]", "", col)
    col = re.sub(r"_+", "_", col)
    col = col.strip("_")
    return col

def normalizar_csv():
    limpiar_consola()
    print("\n=== Normalizar encabezados de un CSV ===\n")
    entrada = input("Ingrese la **ruta absoluta** del archivo CSV de entrada: ").strip()
    if not os.path.isfile(entrada):
        print(f"\nEl archivo {entrada} no existe.")
        input("Presione ENTER para volver al menú...")
        return

    carpeta_script = os.path.dirname(os.path.abspath(__file__))
    salida = os.path.join(carpeta_script, "csv_normalizado.csv")

    df = pd.read_csv(entrada, encoding='utf-8')
    # Normalizar encabezados
    encabezados_originales = list(df.columns)
    df.columns = [normalizar_encabezado(col) for col in encabezados_originales]

    # Detectar posibles columnas de fecha (ajustá/agregá nombres según tu caso)
    columnas_fecha = [
        "marca_temporal", 
        "fecha_de_reparacion", 
        "fecha_de_entrega",
        "timestampreparacion",
        "timestamplista"
    ]

    for col in columnas_fecha:
        if col in df.columns:
            # Intenta formatear la fecha al formato PostgreSQL
            df[col] = pd.to_datetime(df[col], dayfirst=True, errors='coerce').dt.strftime('%Y-%m-%d %H:%M:%S')

    df.to_csv(salida, index=False)
    print(f"\nEncabezados normalizados y fechas convertidas (si aplica).\nArchivo guardado como:\n{salida}\n")
    input("Presione ENTER para volver al menú...")


def obtener_columnas():
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
            cantidad = int(input("¿Cuántas columnas desea extraer?: "))
            if cantidad <= 0:
                print("Ingrese un número mayor a cero.")
            else:
                break
        except ValueError:
            print("Por favor, ingrese un número válido.")

    while True:
        print("¿Desde dónde desea extraer las columnas?")
        print("1. Desde el principio (primeras N columnas)")
        print("2. Desde el final (últimas N columnas)")
        modo = input("Seleccione una opción (1 o 2): ").strip()
        if modo in ['1', '2']:
            break
        else:
            print("Opción inválida.")

    nombre_salida = input("Ingrese el nombre del archivo de salida (debe tener .csv): ").strip()
    if not nombre_salida:
        nombre_salida = "salida.csv"

    if cantidad > df.shape[1]:
        print("La cantidad supera las columnas disponibles. Se extraerán todas.")
        cantidad = df.shape[1]

    if modo == '1':
        resultado = df.iloc[:, :cantidad]
    else:
        resultado = df.iloc[:, -cantidad:]

    limpiar_consola()
    print("\nVista previa de las columnas extraídas (primeras 5 filas):\n")
    print_tabla(resultado, max_filas=5)
    print(f"\nFilas: {resultado.shape[0]}, Columnas: {resultado.shape[1]}\n")

    input("Presione ENTER para guardar el archivo...")

    salida_path = os.path.join(os.getcwd(), nombre_salida)
    resultado.to_csv(salida_path, index=False)

    limpiar_consola()
    print(f"\n¡Archivo guardado como '{nombre_salida}' en:\n{salida_path}\n")
    print(f"({resultado.shape[0]} filas, {resultado.shape[1]} columnas)")

def obtener_filas():
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

def ver_columnas():
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

def main():
    while True:
        opcion = menu_principal()
        if opcion == "1":
            obtener_columnas()
        elif opcion == "2":
            obtener_filas()
        elif opcion == "3":
            ver_columnas()
        elif opcion == "4":
            limpiar_consola()
            print("\nSaliendo del programa...\n")
            break
        elif opcion == "5":
            normalizar_csv()
        else:
            print("Opción no válida. Intente de nuevo.")

if __name__ == "__main__":
    limpiar_consola()
    main()
