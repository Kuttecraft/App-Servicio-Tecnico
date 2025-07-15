import unicodedata
import re
import pandas as pd
import os

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

def normalizar_csv(ruta_entrada, ruta_salida=None):
    """
    Normaliza los encabezados del CSV de entrada y los guarda en el archivo de salida.
    Si no se especifica ruta_salida, guarda en el mismo directorio con _normalizado.
    """
    if not os.path.isfile(ruta_entrada):
        print(f"El archivo {ruta_entrada} no existe.")
        return

    df = pd.read_csv(ruta_entrada, encoding='utf-8')
    columnas_originales = list(df.columns)
    df.columns = [normalizar_encabezado(col) for col in columnas_originales]

    # Detectar posibles columnas de fecha y normalizarlas si existen
    columnas_fecha = [
        "marca_temporal", 
        "fecha_de_reparacion", 
        "fecha_de_entrega",
        "timestampreparacion",
        "timestamplista"
    ]
    for col in columnas_fecha:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], dayfirst=True, errors='coerce').dt.strftime('%Y-%m-%d %H:%M:%S')

    if not ruta_salida:
        base, ext = os.path.splitext(ruta_entrada)
        ruta_salida = base + "_normalizado.csv"

    df.to_csv(ruta_salida, index=False)
    print(f"Archivo guardado como: {ruta_salida}")
    return ruta_salida
