import os 
import tabulate 


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


def print_tabla(df, max_filas=5, max_columnas=8):
    cols = list(df.columns[:max_columnas])
    print(tabulate(df[cols].head(max_filas), headers='keys', tablefmt='github', showindex=False))
    if df.shape[1] > max_columnas:
        print(f"\n... ({df.shape[1] - max_columnas} columnas no mostradas)")
    if df.shape[0] > max_filas:
        print(f"... ({df.shape[0] - max_filas} filas no mostradas)")
