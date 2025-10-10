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
    
    try:
        # Ejecutar el comando curl y capturar la salida
        process = subprocess.run(
            curl_command, 
            capture_output=True, 
            text=True, 
            check=True, # Lanza excepción si curl devuelve error
            timeout=15
        )
        
        headers = process.stdout
        
        # 1. Extraer Cookies: Buscar la línea Set-Cookie
        cookie_matches = re.findall(r"Set-Cookie: (B1SESSION=[^;]+);", headers)
        routeid_matches = re.findall(r"Set-Cookie: (ROUTEID=[^;]+);", headers)

        if not cookie_matches or not routeid_matches:
            raise ValueError("No se pudo obtener la cookie de sesión o ROUTEID de la respuesta de curl.")

        cookie_string = f"{cookie_matches[0]}; {routeid_matches[0]}"
        
        # 2. Extraer SessionId: Parsear el cuerpo JSON
        body_json = headers.split('\r\n\r\n')[-1]
        session_data = json.loads(body_json)
        
        session_id = session_data.get('SessionId')

        return (cookie_string, session_id)
        
    except subprocess.CalledProcessError as e:
        logging.error(f"Fallo del subproceso CURL (Código {e.returncode}): {e.stderr.strip()}")
        return (None, None)
    except Exception as e:
        logging.error(f"Error durante la ejecución del login CURL: {e}")
        return (None, None)


def get_sap_session():
    """
    Utiliza CURL para el login exitoso y luego configura una sesión de requests.
    Retorna el objeto de sesión de requests.
    """
    
    cookie_string, session_id = run_curl_login()
    
    if not session_id:
        logging.error("No se pudo iniciar sesión con CURL.")
        return None
        
    # Crear la sesión de requests e inyectar la cookie
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
            # Obtener el SessionId de la cookie para el logging
            match = re.search(r"B1SESSION=(\d+)", session.headers.get('Cookie'))
            session_id = match.group(1) if match else "Desconocida"
            
            # El logout simplemente requiere que se envíe la cookie correcta.
            session.post(f"{SERVICE_LAYER_URL}/Logout")
            logging.info(f"Sesión {session_id} cerrada correctamente.")
        except requests.exceptions.RequestException as e:
            logging.warning(f"Error al cerrar sesión: {e}")