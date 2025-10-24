export { camposConsultaSAP } from '../models/proveedoresModel.js';
/**
 * Consulta el Service Layer para obtener datos de proveedores.
 * @param {AxiosInstance} sessionInstance - Instancia de Axios con la sesión activa.
 */

export async function getSupplierData(sessionInstance) {
    // Columnas solicitadas: CardCode, RUC (FederalTaxID), Nombre SN (CardName)
    const columnsToSelect = Object.keys(camposConsultaSAP).join(',');
    
    // Filtro: CardType eq 'cSupplier'
    const query = `/BusinessPartners?$filter=CardType eq 'cSupplier'&$select=${columnsToSelect}`;

    try {
        const response = await sessionInstance.get(query);
        return response.data.value || []; // Retorna la lista de objetos 'value'
    }
    catch (error) {
        console.error('❌ Error al obtener datos de proveedores.');

        if (error.response)
            console.error(`Estado: ${error.response.status}`, error.response.data);
        
        return null;
    }
}