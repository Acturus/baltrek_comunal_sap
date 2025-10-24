// sync.js
import 'dotenv/config';
import mondaySdk from 'monday-sdk-js';

// Importa las funciones de DATOS de SAP (de mi sugerencia anterior)
import { getAllSupplierData, createDeltaFilter } from '../services/supplierService.js'; 
// Importa las funciones de SESIÓN de SAP (de tu archivo)
import { getSapSession, sapLogout } from './sap.js';

// --- CONFIGURACIÓN REQUERIDA ---
// Pega aquí los IDs que obtuviste del script 'find_ids.js'

const MONDAY_BOARD_ID = 18213048823; // ⚠️ REEMPLAZA ESTO

const COLUMN_IDS = {
  "Name": "name",
  "Código SN": "text_mkwt7af2",
  "RUC": "numeric_mkwtxtnh",
  "Nombre SN": "text_mkwt3xdn",
  "Creación SAP": "date_mkx1an41",
  "Última Actualización SAP": "date_mkx14xa9",
  "Registro de creación": "pulse_log_mkx1jrw3",
  "Última actualización": "pulse_updated_mkx17xqq"
}

const monday = mondaySdk({ token: process.env.MONDAY_API_KEY });

/**
 * Obtiene el timestamp más reciente de la columna 'Última Actualización SAP'
 */
async function getLatestSyncTimestamp() {
  const dateColumnId = COLUMN_IDS["Última Actualización SAP"];
  if (!dateColumnId) {
    console.warn("ADVERTENCIA: No se encontró el ID de la columna 'Última Actualización SAP'. Se forzará una sincronización completa.");
    return null;
  }

  console.log(`Buscando última fecha de sincronización en Monday (Columna: ${dateColumnId})...`);

  const query = `query($boardId: ID!, $columnId: String!) {
    boards(ids: [$boardId]) {
      items_page(
        limit: 1,
        query_params: {
          order_by: [{column_id: $columnId, direction: desc}],
          rules: [{column_id: $columnId, compare_value: [""] , operator: not_is_empty}]
        }
      ) {
        items {
          column_values(ids: [$columnId]) {
            value
            text
          }
        }
      }
    }
  }`;

  try {
    const response = await monday.api(query, {
      variables: { boardId: MONDAY_BOARD_ID, columnId: dateColumnId }
    });

    const items = response.data.boards[0].items_page.items;

    if (items.length > 0 && items[0].column_values[0].value) {
      const lastDate = items[0].column_values[0].text;
      console.log(`Última sincronización detectada: ${lastDate}`);
      // Asume que la fecha de Monday está en formato 'YYYY-MM-DD HH:mm:ss' (UTC)
      return new Date(lastDate.replace(' ', 'T') + 'Z').toISOString();
    } else {
      console.log("No se encontraron fechas. Se ejecutará la sincronización completa.");
      return null; // Primera sincronización
    }
  } catch (err) {
    console.error("Error al obtener la última fecha de sincronización:", err.message);
    return null; // Forzar sincronización completa en caso de error
  }
}

/**
 * Busca un item en Monday usando el valor de la columna RUC.
 * @returns {object | null} El item de Monday (con id) o null si no se encuentra.
 */
async function findMondayItemByRUC(rucValue) {
  const rucColumnId = COLUMN_IDS["RUC"];
  
  const query = `query($boardId: ID!, $columnId: String!, $columnValue: String!) {
    items_page_by_column_values(
      board_id: $boardId,
      column_id: $columnId,
      column_value: $columnValue,
      limit: 1
    ) {
      items {
        id
        name
      }
    }
  }`;

  try {
    const response = await monday.api(query, {
      variables: {
        boardId: MONDAY_BOARD_ID,
        columnId: rucColumnId,
        columnValue: rucValue
      }
    });

    const items = response.data.items_page_by_column_values.items;
    return items.length > 0 ? items[0] : null;

  } catch (err) {
    console.error(`Error buscando item con RUC ${rucValue}:`, err.message);
    return null;
  }
}

/**
 * Formatea un objeto de proveedor SAP al formato de columna de Monday.
 * @param {object} sapSupplier - El objeto de proveedor de SAP.
 * @returns {object} Objeto listo para la API de Monday (ej. { "texto": "valor" })
 */
function formatSapToMondayColumns(sapSupplier) {
  const columnValues = {};

  // --- Mapeo de campos ---
  
  if (COLUMN_IDS["RUC"]) {
    columnValues[COLUMN_IDS["RUC"]] = sapSupplier.FederalTaxID || "";
  }
  if (COLUMN_IDS["Código SN"]) {
    columnValues[COLUMN_IDS["Código SN"]] = sapSupplier.CardCode || "";
  }
  if (COLUMN_IDS["Nombre SN"]) {
    columnValues[COLUMN_IDS["Nombre SN"]] = sapSupplier.CardName || "";
  }

  // --- Manejo de Fechas ---
  
  // Creación SAP (Solo Fecha)
  if (COLUMN_IDS["Creación SAP"] && sapSupplier.CreateDate) {
    columnValues[COLUMN_IDS["Creación SAP"]] = {
      "date": sapSupplier.CreateDate.split('T')[0] // 'YYYY-MM-DD'
    };
  }

  // Última Actualización SAP (Fecha y Hora)
  if (COLUMN_IDS["Última Actualización SAP"] && sapSupplier.UpdateDate && sapSupplier.UpdateTime != null) {
    try {
      // SAP envía fecha en UTC (ej. '2025-10-24T00:00:00Z')
      const date = new Date(sapSupplier.UpdateDate);
      const timeStr = sapSupplier.UpdateTime.toString().padStart(4, '0'); // 1432 -> '1432'
      const hours = timeStr.substring(0, 2); // '14'
      const minutes = timeStr.substring(2, 4); // '32'

      // Formato para Monday API: 'YYYY-MM-DD HH:MM:SS' (en UTC)
      const datePart = date.toISOString().split('T')[0];
      const timePart = `${hours}:${minutes}:00`;

      columnValues[COLUMN_IDS["Última Actualización SAP"]] = {
        "date": datePart,
        "time": timePart
      };
    } catch (e) {
      console.warn(`Error formateando fecha para ${sapSupplier.CardCode}:`, e.message);
    }
  }

  return columnValues;
}

/**
 * Crea un nuevo item en Monday.
 */
async function createMondayItem(itemName, columnValues) {
  const query = `mutation($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
    create_item (
      board_id: $boardId,
      item_name: $itemName,
      column_values: $columnValues
    ) {
      id
    }
  }`;

  try {
    await monday.api(query, {
      variables: {
        boardId: MONDAY_BOARD_ID,
        itemName: itemName, // Usamos CardName como el nombre del elemento
        columnValues: JSON.stringify(columnValues)
      }
    });
    console.log(`✅ CREADO: ${itemName}`);
  } catch (err) {
    console.error(`❌ ERROR al crear ${itemName}:`, err.message);
  }
}

/**
 * Actualiza un item existente en Monday.
 */
async function updateMondayItem(itemId, itemName, columnValues) {
  const query = `mutation($itemId: ID!, $boardId: ID!, $columnValues: JSON!) {
    change_multiple_column_values (
      item_id: $itemId,
      board_id: $boardId,
      column_values: $columnValues
    ) {
      id
    }
  }`;

  try {
    await monday.api(query, {
      variables: {
        itemId: parseInt(itemId),
        boardId: MONDAY_BOARD_ID,
        columnValues: JSON.stringify(columnValues)
      }
    });
    console.log(`🔄 ACTUALIZADO: ${itemName} (ID: ${itemId})`);
  } catch (err) {
    console.error(`❌ ERROR al actualizar ${itemName}:`, err.message);
  }
}


// --- FUNCIÓN PRINCIPAL ---
async function main() {
  console.log('Iniciando script de sincronización SAP -> Monday...');
  
  let axiosInstance = null; // Instancia de SAP

  try {
    // 1. Obtener la sesión de Axios para SAP
    axiosInstance = await getSapSession();
    
    if (!axiosInstance) {
      console.error("No se pudo iniciar sesión en SAP Service Layer. Abortando.");
      return; // Salir del script
    }

    // 2. Determinar si es sincronización completa o delta
    const lastSyncTimestamp = await getLatestSyncTimestamp();
    let sapFilter = null;

    if (lastSyncTimestamp) {
      // Sincronización Delta
      console.log(`Modo Delta: Buscando cambios desde ${lastSyncTimestamp}`);
      sapFilter = createDeltaFilter(lastSyncTimestamp);
    } else {
      // Sincronización Completa
      console.log("Modo Completo: Obteniendo todos los proveedores.");
    }

    // 3. Obtener datos de SAP (completos o delta)
    const suppliers = await getAllSupplierData(axiosInstance, sapFilter);

    if (!suppliers) {
      console.error("Falló la obtención de datos de SAP. Abortando.");
      return; // Salir, el 'finally' se ejecutará
    }
    
    if (suppliers.length === 0) {
      console.log("No se encontraron proveedores nuevos o actualizados en SAP. Sincronización finalizada.");
      return; // Salir, el 'finally' se ejecutará
    }

    console.log(`Procesando ${suppliers.length} registros de SAP...`);

    // 4. Procesar y cargar datos en Monday
    for (const supplier of suppliers) {
      if (!supplier.FederalTaxID) {
        console.warn(`Saltando proveedor ${supplier.CardCode} por no tener RUC (FederalTaxID).`);
        continue;
      }

      // Formatear datos para Monday
      const columnValues = formatSapToMondayColumns(supplier);
      // Usar CardName para el nombre del elemento, o CardCode si CardName está vacío
      const itemName = supplier.CardName || supplier.CardCode; 

      // Buscar si el item ya existe por RUC
      const existingItem = await findMondayItemByRUC(supplier.FederalTaxID);

      if (existingItem) {
        // 5. Actualizar item existente
        await updateMondayItem(existingItem.id, itemName, columnValues);
      } else {
        // 6. Crear nuevo item
        await createMondayItem(itemName, columnValues);
      }
    }

    console.log("🎉 Sincronización completada.");

  } catch (error) {
    // Capturar cualquier error inesperado durante la sincronización
    console.error("❌ Ocurrió un error inesperado durante la sincronización:", error);
  } finally {
    // 5. Cerrar la sesión de SAP
    if (axiosInstance) {
      await sapLogout(axiosInstance);
    }
  }
}

// Ejecutar la función principal
main().catch(console.error);