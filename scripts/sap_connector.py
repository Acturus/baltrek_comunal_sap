import requests
import json
import logging
from config import SERVICE_LAYER_URL, COMPANY_DB, USERNAME, PASSWORD, CIPHER

# Importaciones para el adaptador SSL/TLS
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.ssl_ import create_urllib3_context

# Configurar logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Adaptador Personalizado ---
# Bloque necesario para que la librería requests/urllib3 reconozca el cipher obsoleto
try:
    requests.packages.urllib3.util.ssl_.DEFAULT_CIPHERS += ":" + CIPHER
except AttributeError:
    pass 

class LegacyTLSAdapter(HTTPAdapter):
    """
    Adaptador personalizado que fuerza el uso de TLSv1 (TLS 1.0) y la cipher suite AES256-SHA.
    Deshabilita la verificación del hostname para resolver el error 'ValueError' cuando se usa verify=False.
    """
    
    def init_poolmanager(self, connections, maxsize, block=False):
        # Crear un contexto SSL/TLS específico
        ctx = create_urllib3_context()
        
        # --- FIX CRUCIAL: Desactivar la verificación de hostname ---
        # Resuelve el ValueError al combinar verify=False con la verificación del host.
        ctx.check_hostname = False
        
        try:
            ctx.minimum_version = requests.packages.urllib3.util.ssl_.TLSVersion.TLSv1_0 
            ctx.set_ciphers(CIPHER)
        except AttributeError:
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
    
    # Configuración de headers e Ignorar certificado (equivale a --insecure)
    session.verify = False 
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