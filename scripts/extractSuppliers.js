import { getSapSession, sapLogout } from './sapConnector.js';

/**
 * Consulta el Service Layer para obtener datos de proveedores.
 * @param {AxiosInstance} sessionInstance - Instancia de Axios con la sesión activa.
 */
async function getSupplierData(sessionInstance) {
    // Columnas solicitadas: CardCode, RUC (FederalTaxID), Nombre SN (CardName)
    const columnsToSelect = 'CardCode,FederalTaxID,CardName';
    
    // Filtro: CardType eq 'cSupplier'
    //const query = `/BusinessPartners?$filter=CardType eq 'cSupplier'&$select=${columnsToSelect}`;
    const query = `/BusinessPartners?$top=5`;

    try {
        const response = await sessionInstance.get(query);

        return response.data.value || []; // Retorna la lista de objetos 'value'
    } catch (error) {
        console.error('❌ Error al obtener datos de proveedores.');
        if (error.response) {
            console.error(`Estado: ${error.response.status}`, error.response.data);
        }
        return null;
    }
}

// --- Ejecución Principal ---
async function main() {
    const sapSession = await getSapSession();

    if (sapSession) {
        console.log('🔎 Consultando datos de proveedores...');
        const suppliers = await getSupplierData(sapSession);

        if (suppliers) {
            console.log('\n--- JSON de Datos de Proveedores ---');
            console.log(JSON.stringify(suppliers, null, 4));
            console.log(`\n✅ Total de registros encontrados: ${suppliers.length}`);
        }
        
        await sapLogout(sapSession);
    }
}

main();