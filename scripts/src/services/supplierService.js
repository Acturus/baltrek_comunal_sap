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

/**
 * Consulta el Service Layer para obtener datos de proveedores.
 * @param {AxiosInstance} sessionInstance - Instancia de Axios con la sesión activa.
 */

export async function getSupplierData(sessionInstance) {
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