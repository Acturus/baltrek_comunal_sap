import camposConsultaSAP from '../models/proveedoresModel.js';

/**
 * Obtiene datos de proveedores de SAP, manejando la paginación automáticamente.
 * @param {AxiosInstance} sessionInstance - Instancia de Axios con la sesión activa.
 * @param {string} [filter] - Filtro OData adicional (ej. para fechas).
 */
export async function getAllSupplierData(sessionInstance, filter = null) {
  let allSuppliers = [];
  const columnsToSelect = Object.keys(camposConsultaSAP).join(',');
  
  // Construye el filtro base
  let filterQuery = "CardType eq 'cSupplier'";
  if (filter) {
    filterQuery += ` and (${filter})`;
  }

  let query = `/BusinessPartners?$filter=${filterQuery}&$select=${columnsToSelect}`;

  console.log('Iniciando consulta a SAP...');

  try {
    while (query) {
      console.log(`SAP Query: ${query}`);
      const response = await sessionInstance.get(query);
      const data = response.data;

      if (data.value) {
        allSuppliers = allSuppliers.concat(data.value);
      }

      // Manejo de paginación
      if (data["odata.nextLink"]) {
        // odata.nextLink viene como 'BusinessPartners?$skiptoken=20'
        // Necesitamos agregar el '/' inicial
        query = `/${data["odata.nextLink"]}`;
      } else {
        query = null; // No hay más páginas, termina el bucle
      }
    }
    
    console.log(`✅ Consulta SAP completada. Total de ${allSuppliers.length} registros obtenidos.`);
    return allSuppliers;

  } catch (error) {
    console.error('❌ Error al obtener datos de proveedores de SAP.');
    if (error.response) {
      console.error(`Estado: ${error.response.status}`, error.response.data);
    }
    return null; // Retorna null para que el script principal se detenga
  }
}

/**
 * Genera un filtro OData para obtener registros actualizados desde una fecha/hora.
 * @param {string} isoTimestamp - Fecha/Hora en formato ISO (ej. '2025-10-24T15:30:00.000Z')
 * @returns {string} Filtro OData.
 */
export function createDeltaFilter(isoTimestamp) {
  const lastSyncDate = new Date(isoTimestamp);
  
  // SAP usa fechas y horas separadas.
  // Convertimos a UTC para ser consistentes.
  const sapDate = lastSyncDate.toISOString().split('T')[0]; // '2025-10-24'
  const sapTime = lastSyncDate.getUTCHours() * 100 + lastSyncDate.getUTCMinutes(); // 1530

  // El filtro busca:
  // 1. Registros actualizados en un día posterior.
  // O
  // 2. Registros actualizados en el mismo día, pero a una hora posterior.
  const filter = `(UpdateDate gt '${sapDate}') or (UpdateDate eq '${sapDate}' and UpdateTime gt ${sapTime})`;
  
  console.log(`Filtro Delta SAP generado: ${filter}`);
  return filter;
}