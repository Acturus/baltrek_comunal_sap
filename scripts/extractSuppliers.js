import { getSapSession, sapLogout } from './sapConnector.js';
import fs from 'fs/promises';

/**
 * Consulta el Service Layer para obtener datos de proveedores.
 * @param {AxiosInstance} sessionInstance - Instancia de Axios con la sesión activa.
 */

const camposConsultaSAP = [
    // Primer grupo de campos
    "CardCode",
    "CardType",
    "FederalTaxID",
    "CardName",
    "GroupCode",
    "Country",
    "FatherType",
    "Valid",
    "Frozen",
    "PeymentMethodCode",
    "VatGroupLatinAmerica",
    "TypeReport",
    "ShaamGroup",
    "Series",
    "UpdateDate",
    "UpdateTime",
    "CreateDate",
    "CreateTime",

    // Segundo grupo de campos (U_Campos)
    "U_MSSL_BTP",
    "U_MSSL_BTD",
    "U_MSSL_BAP",
    "U_MSSL_BAM",
    "U_MSSL_BN1",
    "U_MSSL_BN2",
    "U_MSSL_BAR",
    "U_MSSL_BPH",
    "U_MSSL_BVI",
    "U_MSSL_BBC",
    "U_MSSL_BEP",
    "U_MSSL_BEC",
    "U_MSSL_BCC",
    "U_MSSL_BCD",
    "U_MSSL_BCV"
];

async function getSupplierData(sessionInstance) {
    // Columnas solicitadas: CardCode, RUC (FederalTaxID), Nombre SN (CardName)
    const columnsToSelect = camposConsultaSAP.join(',');
    
    // Filtro: CardType eq 'cSupplier'
    const query = `/BusinessPartners?$filter=CardType eq 'cSupplier'&$select=${columnsToSelect}`;

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