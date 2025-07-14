from tabulate import tabulate
import pandas as pd
import os
import unicodedata
import re

# <--- Vistas y utilidades de consola --->

def limpiar_consola():
    if os.name == 'nt':
        os.system('cls')
    else:
        os.system('clear')

def menu_principal():
    limpiar_consola()
    mostrar_banner()
    print("1. Obtener datos")
    print("2. Ver datos")
    print("3. Normalizar CSV")
    print("4. Salir")
    return input("\nSeleccione una opción: ").strip()

def menu_obtener_datos():
    limpiar_consola()
    print("1. Obtener columnas de un CSV")
    print("2. Obtener filas de un CSV")
    print("3. Obtener estadísticas básicas del CSV")
    print("4. Volver al menú principal")
    return input("\nSeleccione una opción: ").strip()

def menu_ver_datos():
    limpiar_consola()
    print("1. Ver columnas del CSV")
    print("2. Ver filas por rango (de N a M)")
    print("3. Buscar valor en columna")
    print("4. Volver al menú principal")
    return input("\nSeleccione una opción: ").strip()

def menu_normalizar_csv():
    limpiar_consola()
    print("1. Normalizar encabezados de un CSV")
    print("2. Cortar y exportar columnas a un nuevo CSV")
    print("3. Volver al menú principal")
    return input("\nSeleccione una opción: ").strip()

def mostrar_banner():
    print(r"")
    print(r"██╗  ██╗██╗   ██╗████████╗████████╗███████╗ ██████╗██████╗  █████╗ ███████╗████████╗")
    print(r"██║ ██╔╝██║   ██║╚══██╔══╝╚══██╔══╝██╔════╝██╔════╝██╔══██╗██╔══██╗██╔════╝╚══██╔══╝")
    print(r"█████╔╝ ██║   ██║   ██║      ██║   █████╗  ██║     ██████╔╝███████║█████╗     ██║   ")
    print(r"██╔═██╗ ██║   ██║   ██║      ██║   ██╔══╝  ██║     ██╔══██╗██╔══██║██╔══╝     ██║   ")
    print(r"██║  ██╗╚██████╔╝   ██║      ██║   ███████╗╚██████╗██║  ██║██║  ██║██║        ██║   ")
    print(r"╚═╝  ╚═╝ ╚═════╝    ╚═╝      ╚═╝   ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝        ╚═╝   ")
    print()

def print_tabla(df, max_filas=5, max_columnas=8):
    cols = list(df.columns[:max_columnas])
    print(tabulate(df[cols].head(max_filas), headers='keys', tablefmt='github', showindex=False))
    if df.shape[1] > max_columnas:
        print(f"\n... ({df.shape[1] - max_columnas} columnas no mostradas)")
    if df.shape[0] > max_filas:
        print(f"... ({df.shape[0] - max_filas} filas no mostradas)")

def main():
    while True:
        opcion = menu_principal()
        if opcion == "1":
            while True:
                subop = menu_obtener_datos()
                if subop == "1":
                    obtener_columnas()
                elif subop == "2":
                    obtener_filas()
                elif subop == "3":
                    obtener_estadisticas_basicas()  # ¡A implementar!
                elif subop == "4":
                    break
                else:
                    print("Opción no válida.")
        elif opcion == "2":
            while True:
                subop = menu_ver_datos()
                if subop == "1":
                    ver_columnas()
                elif subop == "2":
                    ver_filas_rango()  # ¡A implementar!
                elif subop == "3":
                    buscar_valor_columna()  # ¡A implementar!
                elif subop == "4":
                    break
                else:
                    print("Opción no válida.")
        elif opcion == "3":
            while True:
                subop = menu_normalizar_csv()
                if subop == "1":
                    normalizar_csv()
                elif subop == "2":
                    cortar_columnas_csv()
                elif subop == "3":
                    break
                else:
                    print("Opción no válida.")
        elif opcion == "4":
            limpiar_consola()
            print("\nSaliendo de Kuttecraft CSV Toolkit...\n")
            break
        else:
            print("Opción no válida. Intente de nuevo.")


# <----------- Acciones por consola ----------->

# =======================
# 1. OBTENER DATOS
# =======================

def obtener_columnas():
    """
    Extrae las primeras o últimas N columnas de un CSV y las guarda en un nuevo archivo.
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

# =======================
# 2. VER DATOS
# =======================

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

# =======================
# 3. NORMALIZAR CSV
# =======================

def normalizar_encabezado(col):
    """
    Normaliza un string de columna para que sea compatible con SQL y consistente.
    """
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
    """
    Normaliza encabezados y convierte fechas reconocidas a formato estándar.
    """
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

if __name__ == "__main__":
    main()
    limpiar_consola()
    main()