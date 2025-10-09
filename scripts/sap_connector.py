import requests
import json
import logging
from config import SERVICE_LAYER_URL, COMPANY_DB, USERNAME, PASSWORD, CIPHER

# Configurar logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.ssl_ import create_urllib3_context

# Agregar el cipher obsoleto al conjunto por defecto (solo necesario para versiones antiguas de OpenSSL)
try:
    requests.packages.urllib3.util.ssl_.DEFAULT_CIPHERS += ":" + CIPHER
except AttributeError:
    pass # Ya está configurado o la versión de requests/urllib3 no lo necesita

class LegacyTLSAdapter(HTTPAdapter):
    """Adaptador que fuerza conexiones viejas"""
    
    def init_poolmanager(self, connections, maxsize, block=False):
        # Crear un contexto SSL/TLS específico
        ctx = create_urllib3_context()
        
        try:
            ctx.minimum_version = requests.packages.urllib3.util.ssl_.TLSVersion.TLSv1_0 
            ctx.set_ciphers(CIPHER)
        except AttributeError:
            # Fallback si las constantes de versión no existen
            pass
        
        self.poolmanager = requests.packages.urllib3.poolmanager.PoolManager(
            num_pools=connections,
            maxsize=maxsize,
            block=block,
            ssl_context=ctx
        )

def get_sap_session():
    """Realiza el login con SAP B1 y retorna la sesión de requests (con la cookie B1SESSION)."""
    
    login_url = f"{SERVICE_LAYER_URL}/Login"
    login_payload = {
        "CompanyDB": COMPANY_DB,
        "UserName": USERNAME,
        "Password": PASSWORD
    }
    
    # Crea la sesión e instala el adaptador
    session = requests.Session()
    session.mount("https://", LegacyTLSAdapter())
    
    # Configuración de headers para el login
    session.verify = False # Deshabilitar verificación de certificado (--insecure)
    session.headers.update({'Content-Type': 'application/json'})

    try:
        response = session.post(login_url, data=json.dumps(login_payload))
        response.raise_for_status()
        
        logging.info("Login exitoso. Sesión establecida.")
        return session
        
    except requests.exceptions.RequestException as e:
        logging.error(f"Fallo en el login: {e}")
        if response is not None:
            logging.error(f"Respuesta del servidor: {response.status_code}, {response.text}")
        return None

def sap_logout(session):
    """Cierra la sesión de SAP B1."""
    if session:
        try:
            session.post(f"{SERVICE_LAYER_URL}/Logout")
            logging.info("Sesión cerrada correctamente.")
        except requests.exceptions.RequestException as e:
            logging.warning(f"Error al cerrar sesión, pero continuando: {e}")