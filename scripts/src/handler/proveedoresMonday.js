// sync.js
import 'dotenv/config';
import mondaySdk from 'monday-sdk-js';

// Importa las funciones de DATOS de SAP (de mi sugerencia anterior)
import { getAllSupplierData, createDeltaFilter } from '../services/supplierService.js'; 
// Importa las funciones de SESIÓN de SAP (de tu archivo)
import { getSapSession, sapLogout } from '../config/sap.js';

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

  // --- INICIO DE LA CORRECCIÓN (Versión limpia sin comentarios) ---
  const query = `query($boardId: ID!, $columnIdString: String!, $columnIdID: ID!) {
    boards(ids: [$boardId]) {
      items_page(
        limit: 1,
        query_params: {
          order_by: [{column_id: $columnIdString, direction: desc}],
          rules: [{column_id: $columnIdID, compare_value: [""] , operator: is_not_empty}]
        }
      ) {
        items {
          column_values(ids: [$columnIdString]) {
            value
            text
          }
        }
      }
    }
  }`;
  // --- FIN DE LA CORRECCIÓN ---

  try {
    const response = await monday.api(query, {
      variables: {
        boardId: MONDAY_BOARD_ID,
        columnIdString: dateColumnId,
        columnIdID: dateColumnId
      }
    });

    if (response.errors) {
      console.error("Error de API al buscar última fecha:", JSON.stringify(response.errors, null, 2));
      return null;
    }
    if (!response.data || !response.data.boards) {
      console.error("Error: La respuesta de la API no contiene 'data' o 'boards'.", response);
      return null;
    }
    
    const items = response.data.boards[0].items_page.items;

    if (items.length > 0 && items[0].column_values[0].value) {
      const lastDate = items[0].column_values[0].text;
      console.log(`Última sincronización detectada: ${lastDate}`);
      return new Date(lastDate.replace(' ', 'T') + 'Z').toISOString();
    } else {
      console.log("No se encontraron fechas. Se ejecutará la sincronización completa.");
      return null; // Primera sincronización
    }
  } catch (err) {
    console.error("Error de RED/SDK al obtener la última fecha de sincronización:", err.message);
    return null;
  }
}

/**
 * Busca un item en Monday usando el valor de la columna RUC.
 * @returns {object | null} El item de Monday (con id) o null si no se encuentra.
 */
async function findMondayItemByRUC_fixed(rucValue) {
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

    // VERIFICACIÓN 1: El SDK reporta errores de GraphQL?
    if (response.errors) {
      console.error(`❌ Error de API al buscar RUC ${rucValue}:`, JSON.stringify(response.errors, null, 2));
      return null;
    }
    
    // VERIFICACIÓN 2: La respuesta tiene 'data'? (Contra rate limits)
    if (!response.data) {
      console.error(`❌ Error inesperado (sin 'data') al buscar RUC ${rucValue}.`, response);
      return null;
    }

    const items = response.data.items_page_by_column_values.items;
    return items.length > 0 ? items[0] : null;

  } catch (err) {
    // Error de red o del SDK
    console.error(`❌ Error de RED/SDK buscando item con RUC ${rucValue}:`, err.message);
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
 * Crea un nuevo item en Monday (versión corregida).
 */
async function createMondayItem(itemName, columnValues, groupId) { // <-- 1. Acepta groupId
  const query = `mutation($boardId: ID!, $itemName: String!, $columnValues: JSON!, $groupId: String!) {
    create_item (
      board_id: $boardId,
      group_id: $groupId, // <-- 2. Añade a la mutación
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
        groupId: groupId, // <-- 3. Pasa la variable
        itemName: itemName,
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

/**
 * Crea items en Monday en lotes de 100 (versión corregida).
 */
async function batchCreateMondayItems(suppliers, groupId) { // <-- 1. Acepta groupId
  console.log(`Iniciando creación en lote de ${suppliers.length} items en el grupo ${groupId}...`);
  
  const CHUNK_SIZE = 100;
  let totalItemsCreados = 0;

  for (let i = 0; i < suppliers.length; i += CHUNK_SIZE) {
    const batch = suppliers.slice(i, i + CHUNK_SIZE);
    
    const itemsToCreate = batch.map(supplier => {
      const columnValues = formatSapToMondayColumns(supplier);
      const itemName = supplier.CardName || supplier.CardCode;
      return { name: itemName, column_values: columnValues };
    });

    // <-- 2. Mutación actualizada con group_id
    const query = `mutation($boardId: ID!, $groupId: String!, $itemsToCreate: [ItemCreateInput!]!) {
      create_multiple_items (
        board_id: $boardId,
        group_id: $groupId,
        items: $itemsToCreate
      ) {
        id
      }
    }`;

    try {
      console.log(`Enviando lote ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(suppliers.length / CHUNK_SIZE)}...`);
      
      const response = await monday.api(query, {
        variables: {
          boardId: MONDAY_BOARD_ID,
          groupId: groupId, // <-- 3. Pasa la variable
          itemsToCreate: itemsToCreate
        }
      });

      // --- INICIO DE LOG DE DIAGNÓSTICO ---
      console.log('Respuesta del lote:', JSON.stringify(response, null, 2));

      if (response.errors) {
         console.error('❌ Error en el lote (GraphQL):', response.errors);
         return; // Detener
      }
      if (!response.data || !response.data.create_multiple_items) {
         console.error('❌ Error, la API no devolvió "create_multiple_items".');
         return; // Detener
      }
      // --- FIN DE LOG DE DIAGNÓSTICO ---
      
      const itemsEnEsteLote = response.data.create_multiple_items.length;
      console.log(`Lote exitoso. Items creados en este lote: ${itemsEnEsteLote}`);
      totalItemsCreados += itemsEnEsteLote;

    } catch (err) {
      console.error(`❌ ERROR al crear lote:`, err.message);
      if (err.response && err.response.data) {
        console.error("Detalle del error:", JSON.stringify(err.response.data, null, 2));
      }
      console.log("Se detiene la creación en lote para evitar más errores.");
      return;
    }
  }

  console.log(`✅ Creación en lote finalizada. ${totalItemsCreados} items creados (según la API).`);
}

/**
 * Busca el ID de un grupo específico dentro de un tablero por su nombre.
 */
async function getGroupId(boardId, groupName) {
  console.log(`Buscando ID del grupo "${groupName}"...`);
  const query = `query($boardId: ID!) {
    boards(ids: [$boardId]) {
      groups {
        id
        title
      }
    }
  }`;
  try {
    const response = await monday.api(query, { variables: { boardId: parseInt(boardId) } });
    if (response.errors) {
      console.error("Error de API al buscar grupos:", response.errors);
      return null;
    }
    const groups = response.data.boards[0].groups;
    const group = groups.find(g => g.title.trim().toLowerCase() === groupName.trim().toLowerCase());
    
    if (group) {
      console.log(`Grupo encontrado. ID: ${group.id}`);
      return group.id;
    } else {
      console.error(`❌ No se encontró el grupo "${groupName}".`);
      console.log("Grupos disponibles:", groups.map(g => g.title));
      return null;
    }
  } catch (err) {
    console.error("Error al buscar grupos:", err.message);
    return null;
  }
}


// --- FUNCIÓN PRINCIPAL (MODIFICADA) ---
// --- FUNCIÓN PRINCIPAL ---
async function main() {
  console.log('Iniciando script de sincronización SAP -> Monday...');
  
  // ⚠️ IMPORTANTE: Define el nombre exacto de tu grupo
  const MONDAY_GROUP_NAME = "Información SAP (3)";
  
  let axiosInstance = null;

  try {
    axiosInstance = await getSapSession();
    
    if (!axiosInstance) {
      console.error("No se pudo iniciar sesión en SAP Service Layer. Abortando.");
      return;
    }
    
    // --- NUEVO: Obtener el ID del Grupo ---
    const groupId = await getGroupId(MONDAY_BOARD_ID, MONDAY_GROUP_NAME);
    if (!groupId) {
      console.error(`No se pudo encontrar el grupo "${MONDAY_GROUP_NAME}". Abortando.`);
      return; // El 'finally' se encargará de cerrar la sesión
    }
    // --- FIN DE NUEVO BLOQUE ---

    const lastSyncTimestamp = await getLatestSyncTimestamp();
    let sapFilter = null;
    let isFullSync = false;

    if (lastSyncTimestamp) {
      console.log(`Modo Delta: Buscando cambios desde ${lastSyncTimestamp}`);
      sapFilter = createDeltaFilter(lastSyncTimestamp);
    } else {
      console.log("Modo Completo: Obteniendo todos los proveedores.");
      isFullSync = true;
    }

    const suppliers = await getAllSupplierData(axiosInstance, sapFilter);

    if (!suppliers || suppliers.length === 0) {
      console.log("No se encontraron proveedores nuevos o actualizados en SAP. Sincronización finalizada.");
      return;
    }

    console.log(`Procesando ${suppliers.length} registros de SAP...`);

    if (isFullSync) {
      console.log("Ejecutando lógica de Sincronización Completa (Lote)...");
      // 👇 Pasar el groupId
      await batchCreateMondayItems(suppliers, groupId); 

    } else {
      console.log("Ejecutando lógica Delta (buscar y actualizar)...");
      
      for (const supplier of suppliers) {
        if (!supplier.FederalTaxID) {
          console.warn(`Saltando proveedor ${supplier.CardCode} por no tener RUC (FederalTaxID).`);
          continue;
        }

        const columnValues = formatSapToMondayColumns(supplier);
        const itemName = supplier.CardName || supplier.CardCode; 
        
        // Usar la versión corregida de findMondayItem (findMondayItemByRUC_fixed) si la tienes
        const existingItem = await findMondayItemByRUC_fixed(supplier.FederalTaxID); 

        if (existingItem) {
          await updateMondayItem(existingItem.id, itemName, columnValues);
        } else {
          // 👇 Pasar el groupId
          await createMondayItem(itemName, columnValues, groupId);
        }
      }
    }

    console.log("🎉 Sincronización completada.");

  } catch (error) {
    console.error("❌ Ocurrió un error inesperado durante la sincronización:", error);
  } finally {
    if (axiosInstance) {
      await sapLogout(axiosInstance);
    }
  }
}

// Ejecutar la función principal
main().catch(console.error);
