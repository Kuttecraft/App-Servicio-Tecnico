from utils.consola import limpiar_consola, mostrar_banner
from obtener_datos.obtener_columnas import obtener_columnas
from obtener_datos.obtener_filas import obtener_filas
from obtener_datos.obtener_estadisticas import obtener_estadisticas_basicas
from gestionar_encabezados.gestionar_encabezados import (
    obtener_y_ver_encabezados,
    ver_encabezados_csv,
    generar_estructura_desde_csv,
    cortar_columnas_csv,
    copiar_csv_por_tablas
)

def menu_principal():
    limpiar_consola()
    mostrar_banner()
    print("1. Obtener columnas de un CSV")
    print("2. Obtener filas de un CSV")
    print("3. Obtener estadísticas básicas del CSV")
    print("4. Gestión de encabezados y tablas")
    print("5. Salir")
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



def menu_encabezados_sugeridos():
    path_guardado = None
    while True:
        limpiar_consola()
        print("=== Gestión de encabezados sugeridos ===\n")
        print("1. Obtener y visualizar encabezados del CSV (previsualizar y guardar)")
        print("2. Ver un archivo de encabezados (previsualizar CSV ya existente)")
        print("3. Generar estructura de tablas desde CSV de definición")
        print("4. Copiar CSV original en archivos separados por tabla con datos reales")
        print("5. Volver al menú principal")
        subop = input("\nSeleccione una opción: ").strip()
        if subop == "1":
            path_guardado = obtener_y_ver_encabezados()
        elif subop == "2":
            ver_encabezados_csv()
        elif subop == "3":
            generar_estructura_desde_csv()
        elif subop == "4":
            copiar_csv_por_tablas()
        elif subop == "5":
            break
        else:
            print("Opción no válida.")


    while True:
        opcion = menu_principal()
        if opcion == "1":
            obtener_columnas()
        elif opcion == "2":
            obtener_filas()
        elif opcion == "3":
            obtener_estadisticas_basicas()
        elif opcion == "4":
            menu_encabezados_sugeridos()
        elif opcion == "5":
            limpiar_consola()
            print("\nSaliendo de KuttecraftToolsCSV ...\n")
            break
        else:
            print("Opción no válida. Intente de nuevo.")

if __name__ == "__main__":
    def main():
        while True:
            opcion = menu_principal()
            if opcion == "1":
                obtener_columnas()
            elif opcion == "2":
                obtener_filas()
            elif opcion == "3":
                obtener_estadisticas_basicas()
            elif opcion == "4":
                menu_encabezados_sugeridos()
            elif opcion == "5":
                limpiar_consola()
                print("\nSaliendo de KuttecraftToolsCSV ...\n")
                break
            else:
                print("Opción no válida. Intente de nuevo.")
    main()
