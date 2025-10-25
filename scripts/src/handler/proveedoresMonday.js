import 'dotenv/config';
import mondaySdk from '@mondaydotcomorg/api';
import { getAllSupplierData, createDeltaFilter } from '../services/supplierService.js';
import { getSapSession, sapLogout } from '../config/sap.js';

const { ApiClient, ClientError } = mondaySdk;

const MONDAY_BOARD_ID = 18213048823;

const COLUMN_IDS = {
  "Name": "name", 
  "Código SN": "text_mkwt7af2",
  "RUC": "numeric_mkwtxtnh",
  "Nombre SN": "text_mkwt3xdn",
  "Creación SAP": "date_mkx1an41",
  "Última Actualización SAP": "date_mkx14xa9",
  "Registro de creación": "pulse_log_mkx1jrw3",
  "Última actualización": "pulse_updated_mkx17xqq"
};

const monday = new ApiClient({ 
  token: process.env.MONDAY_API_KEY,
  requestConfig: {
    headers: {
      'API-Version': '2024-01'
    }
  } 
});


// ===================================================================
// Funciones de Monday (Corregidas)
// ===================================================================

/**
 * Busca el ID de un grupo específico.
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
    const response = await monday.request(query, { boardId: parseInt(boardId) });
    const groups = response.boards[0].groups;
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
    if (err instanceof ClientError) {
      console.error("Error de API al buscar grupos:", JSON.stringify(err.response.errors, null, 2));
    } else {
      console.error(`Error de RED/SDK al buscar grupos: ${err.message}`, err);
    }
    return null;
  }
}

/**
 * Obtiene el timestamp más reciente
 */
async function getLatestSyncTimestamp() {
  const dateColumnId = COLUMN_IDS["Última Actualización SAP"];
  if (!dateColumnId) {
    console.warn("ADVERTENCIA: No se encontró el ID de la columna 'Última Actualización SAP'. Se forzará una sincronización completa.");
    return null;
  }

  console.log(`Buscando última fecha de sincronización en Monday (Columna: ${dateColumnId})...`);

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

  try {
    const response = await monday.request(query, {
      boardId: MONDAY_BOARD_ID,
      columnIdString: dateColumnId,
      columnIdID: dateColumnId
    });
    
    const items = response.boards[0].items_page.items;

    if (items.length > 0 && items[0].column_values[0].value) {
      const lastDate = items[0].column_values[0].text;
      console.log(`Última sincronización detectada: ${lastDate}`);
      return new Date(lastDate.replace(' ', 'T') + 'Z').toISOString();
    } else {
      console.log("No se encontraron fechas. Se ejecutará la sincronización completa.");
      return null;
    }
  } catch (err) {
    if (err instanceof ClientError) {
      console.error("Error de API al buscar última fecha:", JSON.stringify(err.response.errors, null, 2));
    } else {
      console.error("Error de RED/SDK al obtener la última fecha de sincronización:", err.message);
    }
    return null;
  }
}

/**
 * Busca un item en Monday usando el valor de la columna RUC
 * 
 */
async function findMondayItemByRUC(rucValue) {
  const rucColumnId = COLUMN_IDS["RUC"];

  const query = `query($boardId: ID!, $rucColumnId: String!, $rucValue: String!) {
    items_page_by_column_values(
      board_id: $boardId,
      limit: 1,
      columns: [
        { column_id: $rucColumnId, column_values: [$rucValue] }
      ]
    ) {
      items {
        id
        name
      }
    }
  }`;

  try {
    const response = await monday.request(query, {
      boardId: MONDAY_BOARD_ID,
      rucColumnId: rucColumnId,
      // ¡OJO!: column_values deben ser strings para Numbers
      rucValue: String(rucValue)
    });

    const items = response.items_page_by_column_values.items || [];
    return items.length > 0 ? items[0] : null;

  } catch (err) {
    if (err instanceof ClientError) {
      console.error(`❌ Error de API al buscar RUC ${rucValue}:`, JSON.stringify(err.response.errors, null, 2));
    } else {
      console.error(`❌ Error de RED/SDK buscando item con RUC ${rucValue}:`, err.message);
    }
    return null;
  }
}


/**
 * Formatea un objeto de proveedor SAP al formato de columna de Monday.
 */
function formatSapToMondayColumns(sapSupplier) {
  const columnValues = {};
  
  if (COLUMN_IDS["RUC"] && sapSupplier.FederalTaxID) {
    const rucAsNumber = parseFloat(sapSupplier.FederalTaxID);
    if (!isNaN(rucAsNumber)) {
      columnValues[COLUMN_IDS["RUC"]] = rucAsNumber;
    } else {
      console.warn(`RUC "${sapSupplier.FederalTaxID}" no es un número válido. Se omitirá.`);
    }
  }
  
  if (COLUMN_IDS["Código SN"]) {
    columnValues[COLUMN_IDS["Código SN"]] = sapSupplier.CardCode || "";
  }
  if (COLUMN_IDS["Nombre SN"]) {
    columnValues[COLUMN_IDS["Nombre SN"]] = sapSupplier.CardName || "";
  }

  if (COLUMN_IDS["Creación SAP"] && sapSupplier.CreateDate) {
    columnValues[COLUMN_IDS["Creación SAP"]] = {
      "date": sapSupplier.CreateDate.split('T')[0]
    };
  }

  // Última Actualización SAP (Fecha y Hora)
  if (COLUMN_IDS["Última Actualización SAP"] && sapSupplier.UpdateDate && sapSupplier.UpdateTime != null) {
    try {
      const date = new Date(sapSupplier.UpdateDate);

      // --- INICIO DE CORRECCIÓN PARA HORA ---
      // 1. Convertir a string y quitar cualquier ':' existente (ej. '12:3' -> '123')
      let timeStr = sapSupplier.UpdateTime.toString().replace(/:/g, '');
      // 2. Rellenar con ceros a la izquierda (ej. '123' -> '0123')
      timeStr = timeStr.padStart(4, '0');
      // 3. Extraer horas y minutos (ej. '0123' -> '01' y '23')
      const hours = timeStr.substring(0, 2);
      const minutes = timeStr.substring(2, 4);
      // --- FIN DE CORRECCIÓN ---

      const datePart = date.toISOString().split('T')[0];
      const timePart = `${hours}:${minutes}:00`; // (ej. '01:23:00')

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
async function createMondayItem(itemName, columnValues, groupId) {
  const query = `mutation($boardId: ID!, $itemName: String!, $columnValues: JSON!, $groupId: String!) {
    create_item (
      board_id: $boardId,
      group_id: $groupId,
      item_name: $itemName,
      column_values: $columnValues
    ) {
      id
    }
  }`;

  try {
    await monday.request(query, {
      boardId: MONDAY_BOARD_ID,
      groupId: groupId,
      itemName: itemName,
      columnValues: JSON.stringify(columnValues)
    });
    console.log(`✅ CREADO: ${itemName}`);
  } catch (err) {
    // 👇 CORRECCIÓN: Manejo de ClientError
    if (err instanceof ClientError) {
      console.error(`❌ ERROR GraphQL al crear ${itemName}:`, JSON.stringify(err.response.errors, null, 2));
    } else {
      console.error(`❌ ERROR de RED/SDK al crear ${itemName}:`, err.message);
    }
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
    await monday.request(query, {
      itemId: parseInt(itemId),
      boardId: MONDAY_BOARD_ID,
      columnValues: JSON.stringify(columnValues)
    });
    console.log(`🔄 ACTUALIZADO: ${itemName} (ID: ${itemId})`);
  } catch (err) {
    // 👇 CORRECCIÓN: Manejo de ClientError
    if (err instanceof ClientError) {
      console.error(`❌ ERROR GraphQL al actualizar ${itemName}:`, JSON.stringify(err.response.errors, null, 2));
    } else {
      console.error(`❌ ERROR de RED/SDK al actualizar ${itemName}:`, err.message);
    }
  }
}

// --- FUNCIÓN PRINCIPAL  ---
async function main() {
  console.log('Iniciando script de sincronización SAP -> Monday...');
  
  const MONDAY_GROUP_NAME = "Información SAP (3)";
  let axiosInstance = null;

  try {
    axiosInstance = await getSapSession();
    
    if (!axiosInstance) {
      console.error("No se pudo iniciar sesión en SAP Service Layer. Abortando.");
      return;
    }
    
    const groupId = await getGroupId(MONDAY_BOARD_ID, MONDAY_GROUP_NAME);
    if (!groupId) {
      console.error(`No se pudo encontrar el grupo "${MONDAY_GROUP_NAME}". Abortando.`);
      return;
    }

    const lastSyncTimestamp = await getLatestSyncTimestamp();
    let sapFilter = false;

    if (lastSyncTimestamp)
      sapFilter = createDeltaFilter(lastSyncTimestamp);

    const suppliers = await getAllSupplierData(axiosInstance, sapFilter);

    if (!suppliers || suppliers.length === 0) {
      console.log("No se encontraron proveedores nuevos o actualizados en SAP. Sincronización finalizada.");
      return;
    }
    
    for (const supplier of suppliers) {
      if (!supplier.FederalTaxID) {
        console.warn(`Saltando proveedor ${supplier.CardCode} por no tener RUC (FederalTaxID).`);
        continue;
      }

      const columnValues = formatSapToMondayColumns(supplier);
      const itemName = supplier.CardName || supplier.CardCode; 
      
      const existingItem = await findMondayItemByRUC(supplier.FederalTaxID); 

      if (existingItem) {
        await updateMondayItem(existingItem.id, itemName, columnValues);
      } else {
        await createMondayItem(itemName, columnValues, groupId);
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

main().catch(console.error);