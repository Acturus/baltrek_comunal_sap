# sap_connector.py (Código Final y Robustecido)

import requests
import json
import logging
import subprocess
import re
from config import SERVICE_LAYER_URL, COMPANY_DB, USERNAME, PASSWORD, CIPHER

# Configurar logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Función de Soporte para Ejecutar CURL ---
def run_curl_login():
    """
    Ejecuta el comando curl exitoso en el shell y captura los encabezados de respuesta.
    Retorna una tupla: (cookie_header_string, session_id).
    """
    
    # El comando curl que sabemos que funciona en este entorno
    curl_command = [
        "curl", "-X", "POST",
        "--insecure",
        "--tlsv1.0",
        "--ciphers", CIPHER,
        "-sS", "-i",  # -sS: Silencioso, pero muestra errores; -i: Incluir encabezados
        "-H", "Content-Type: application/json",
        "-d", json.dumps({
            "CompanyDB": COMPANY_DB,
            "UserName": USERNAME,
            "Password": PASSWORD
        }),
        f"{SERVICE_LAYER_URL}/Login"
    ]
    
    # Inicializamos las variables
    headers = None
    
    try:
        # Ejecutar el comando curl y capturar la salida
        process = subprocess.run(
            curl_command, 
            capture_output=True, 
            text=True, 
            check=True, # Lanza excepción si curl devuelve error de comando
            timeout=15
        )
        
        headers = process.stdout
        
        # 1. VERIFICACIÓN CRÍTICA: Asegurarse de que el login haya sido 200 OK
        if "HTTP/1.1 200 OK" not in headers:
            logging.error("CURL Login falló. El servidor no devolvió 200 OK.")
            logging.error(f"Respuesta Completa de CURL:\n{headers}")
            raise Exception("CURL no devolvió una respuesta HTTP 200 OK. Revise credenciales.")


        # 2. Extraer Cookies: Buscar la línea Set-Cookie
        cookie_matches = re.findall(r"Set-Cookie: (B1SESSION=[^;]+);", headers)
        routeid_matches = re.findall(r"Set-Cookie: (ROUTEID=[^;]+);", headers)

        if not cookie_matches or not routeid_matches:
            raise ValueError("No se pudo obtener la cookie de sesión o ROUTEID de la respuesta.")

        cookie_string = f"{cookie_matches[0]}; {routeid_matches[0]}"
        
        # 3. Extraer SessionId: Parsear el cuerpo JSON
        # Dividir la respuesta por dos saltos de línea para obtener solo el cuerpo (el último elemento)
        body_json = headers.split('\r\n\r\n')[-1].strip()
        
        if not body_json:
            raise ValueError("El cuerpo de respuesta de CURL está vacío.")

        session_data = json.loads(body_json) 

        session_id = session_data.get('SessionId')

        return (cookie_string, session_id)
        
    except subprocess.CalledProcessError as e:
        # Esto captura errores donde curl falla antes de obtener una respuesta HTTP válida
        logging.error(f"Fallo del subproceso CURL (Código {e.returncode}): {e.stderr.strip()}")
        return (None, None)
    except Exception as e:
        # Esto captura el error de JSON.loads y la excepción lanzada en el paso 1
        logging.error(f"Error durante el procesamiento de la respuesta de CURL: {e}")
        return (None, None)


def get_sap_session():
    """
    Utiliza CURL para el login exitoso y luego configura una sesión de requests.
    Retorna el objeto de sesión de requests.
    """
    
    # 1. Intentar el login con curl y obtener la cookie
    cookie_string, session_id = run_curl_login()
    
    if not session_id:
        logging.error("No se pudo iniciar sesión. Verifique logs para errores de credenciales.")
        return None
        
    # 2. Crear la sesión de requests e inyectar la cookie
    session = requests.Session()
    
    # Inyectar la cookie y headers para peticiones subsiguientes
    session.headers.update({
        'Cookie': cookie_string,
        'Content-Type': 'application/json'
    })
    
    # Deshabilitar verificación de certificado (requerido por el entorno SAP)
    session.verify = False 
    
    logging.info(f"Sesión activa: {session_id}")
    return session


def sap_logout(session):
    """Cierra la sesión de SAP B1."""
    if session and session.headers.get('Cookie'):
        try:
            # El logout simplemente requiere que se envíe la cookie correcta.
            session.post(f"{SERVICE_LAYER_URL}/Logout")
            logging.info("Sesión cerrada correctamente.")
        except requests.exceptions.RequestException as e:
            logging.warning(f"Error al cerrar sesión: {e}")