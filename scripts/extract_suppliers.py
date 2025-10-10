import json
from sap_connector import get_sap_session, sap_logout
from config import SERVICE_LAYER_URL
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def get_supplier_data(session):
    """
    Obtiene CardCode, FederalTaxID (RUC), y CardName de los proveedores.
    """
    
    # $filter=CardType eq 'cSupplier' -> Filtra solo por proveedores
    # $select=CardCode,FederalTaxID,CardName -> Selecciona las columnas solicitadas
    
    # Nota: Si el RUC no funciona con FederalTaxID, prueba LicTradNum.
    columns_to_select = "CardCode,FederalTaxID,CardName"
    
    odata_query = f"/BusinessPartners?$filter=CardType eq 'cSupplier'&$select={columns_to_select}"
    
    data_url = f"{SERVICE_LAYER_URL}{odata_query}"
    
    try:
        response = session.get(data_url)
        response.raise_for_status()
        
        return response.json().get("value", []) # Retorna la lista de objetos o lista vacía
        
    except Exception as e:
        logging.error(f"Fallo al obtener datos: {e}")
        logging.error(f"Respuesta del servidor: {response.status_code}, {response.text}")
        return None

# --- Ejecución Principal ---
if __name__ == "__main__":
    
    # 1. Obtener la sesión (Loguearse)
    sap_session = get_sap_session()
    
    if sap_session:
        # 2. Obtener los datos
        supplier_list = get_supplier_data(sap_session)
        
        if supplier_list:
            print("\n--- Datos de Proveedores (JSON) ---")
            # 3. Mostrar la data en consola
            print(json.dumps(supplier_list, indent=4))
            print(f"\nTotal de registros encontrados: {len(supplier_list)}")
        else:
            print("\nNo se pudieron obtener los datos o no se encontraron proveedores.")
            
        # 4. Cerrar sesión
        sap_logout(sap_session)