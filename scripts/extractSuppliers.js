import { getSapSession, sapLogout } from './sapConnector.js';
import fs from 'fs/promises';

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

async function saveJsonToFile(data, filename) {
    try {
        const jsonString = JSON.stringify(data, null, 4);
        await fs.writeFile(filename, jsonString, 'utf-8');
        console.log(`\n✅ Datos guardados exitosamente en ${filename}`);
        return true;
    } catch (err) {
        console.error(`\n❌ Error al guardar el archivo: ${err.message}`);
        return false;
    }
}


// --- Ejecución Principal ---
async function main() {
    const sapSession = await getSapSession();
    const FILENAME = 'supplier_data_output.json'; // Nombre del archivo

    if (sapSession) {
        console.log('🔎 Consultando datos de proveedores...');
        const suppliers = await getSupplierData(sapSession);

        if (suppliers) {
            // CAMBIO: Llama a la nueva función de guardar en lugar de imprimir en consola
            await saveJsonToFile(suppliers, FILENAME); 
            console.log(`Total de registros encontrados: ${suppliers.length}`);
        } else {
            console.log("\nNo se pudieron obtener los datos de proveedores.");
        }
        
        await sapLogout(sapSession);
    }
}

main();