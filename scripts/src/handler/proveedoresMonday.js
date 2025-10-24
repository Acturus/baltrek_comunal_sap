import 'dotenv/config';
// Importamos el nuevo cliente
import { mondayApiClient } from '@mondaydotcomorg/api';

// Importa las funciones de DATOS de SAP
import { getAllSupplierData, createDeltaFilter } from '../services/supplierService.js';
// Importa las funciones de SESIÓN de SAP
import { getSapSession, sapLogout } from '../config/sap.js';

// --- CONFIGURACIÓN REQUERIDA (¡COMPLETADA!) ---
const MONDAY_BOARD_ID = 18213048823;

const COLUMN_IDS = {
  "Name": "name", // Columna nativa "Elemento"
  "Código SN": "text_mkwt7af2",
  "RUC": "numeric_mkwtxtnh", // Tipo numérico
  "Nombre SN": "text_mkwt3xdn",
  "Creación SAP": "date_mkx1an41",
  "Última Actualización SAP": "date_mkx14xa9",
  "Registro de creación": "pulse_log_mkx1jrw3",
  "Última actualización": "pulse_updated_mkx17xqq"
};
// --- FIN DE CONFIGURACIÓN ---


// Inicializamos el nuevo cliente (usando la API 2024-01)
const monday = mondayApiClient({ 
  token: process.env.MONDAY_API_KEY,
  apiVersion: "2024-01" 
});

// ===================================================================
// Todas las funciones que ya depuramos (con corrección en 'find')
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


/**
 * Obtiene el timestamp más reciente (versión corregida).
 */
async function getLatestSyncTimestamp() {
  const dateColumnId = COLUMN_IDS["Última Actualización SAP"];
  if (!dateColumnId) {
    console.warn("ADVERTENCIA: No se encontró el ID de la columna 'Última Actualización SAP'. Se forzará una sincronización completa.");
    return null;
  }

  console.log(`Buscando última fecha de sincronización en Monday (Columna: ${dateColumnId})...`);

  // Versión final con 2 variables y 'is_not_empty'
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
 * Busca un item en Monday usando el valor de la columna RUC (versión robusta).
 * ¡CORREGIDO para columna numérica!
 */
async function findMondayItemByRUC_fixed(rucValue) {
  const rucColumnId = COLUMN_IDS["RUC"];
  
  // ¡CORRECCIÓN! 
  // La variable $columnValue debe ser String, pero la API de Monday es
  // lo suficientemente inteligente como para comparar un String con una columna numérica.
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
        // Enviamos el RUC como String. Monday lo manejará.
        columnValue: String(rucValue) 
      }
    });

    if (response.errors) {
      console.error(`❌ Error de API al buscar RUC ${rucValue}:`, JSON.stringify(response.errors, null, 2));
      return null;
    }
    if (!response.data) {
      console.error(`❌ Error inesperado (sin 'data') al buscar RUC ${rucValue}.`, response);
      return null;
    }

    const items = response.data.items_page_by_column_values.items;
    return items.length > 0 ? items[0] : null;

  } catch (err) {
    console.error(`❌ Error de RED/SDK buscando item con RUC ${rucValue}:`, err.message);
    return null;
  }
}

/**
 * Formatea un objeto de proveedor SAP al formato de columna de Monday.
 */
function formatSapToMondayColumns(sapSupplier) {
  const columnValues = {};
  
  // ¡CORRECCIÓN! Convertir el RUC (texto de SAP) a número para Monday
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

  // Creación SAP (Solo Fecha)
  if (COLUMN_IDS["Creación SAP"] && sapSupplier.CreateDate) {
    columnValues[COLUMN_IDS["Creación SAP"]] = {
      "date": sapSupplier.CreateDate.split('T')[0] // 'YYYY-MM-DD'
    };
  }

  // Última Actualización SAP (Fecha y Hora)
  if (COLUMN_IDS["Última Actualización SAP"] && sapSupplier.UpdateDate && sapSupplier.UpdateTime != null) {
    try {
      const date = new Date(sapSupplier.UpdateDate);
      const timeStr = sapSupplier.UpdateTime.toString().padStart(4, '0');
      const hours = timeStr.substring(0, 2);
      const minutes = timeStr.substring(2, 4);
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
    await monday.api(query, {
      variables: {
        boardId: MONDAY_BOARD_ID,
        groupId: groupId,
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
async function batchCreateMondayItems(suppliers, groupId) {
  console.log(`Iniciando creación en lote de ${suppliers.length} items en el grupo ${groupId}...`);
  
  const CHUNK_SIZE = 100;
  let totalItemsCreados = 0;

  for (let i = 0; i < suppliers.length; i += CHUNK_SIZE) {
    const batch = suppliers.slice(i, i + CHUNK_SIZE);
    
    const itemsToCreate = batch.map(supplier => {
      const columnValues = formatSapToMondayColumns(supplier);
      // El 'name' (Elemento) se asigna aquí
      const itemName = supplier.CardName || supplier.CardCode;
      return { name: itemName, column_values: columnValues };
    });

    // Versión corregida con 'ItemCreateInput!'
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
          groupId: groupId,
          itemsToCreate: itemsToCreate
        }
      });

      if (response.errors) {
        console.error('❌ Error en el lote (GraphQL):', JSON.stringify(response.errors, null, 2));
        return;
      }
      if (!response.data || !response.data.create_multiple_items) {
        console.error('❌ Error, la API no devolvió "create_multiple_items".');
        return;
      }
      
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


// --- FUNCIÓN PRINCIPAL ---
async function main() {
  console.log('Iniciando script de sincronización SAP -> Monday...');
  
  const MONDAY_GROUP_NAME = "Información SAP (3)"; // ⚠️ VERIFICA ESTE NOMBRE
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
        
        const existingItem = await findMondayItemByRUC_fixed(supplier.FederalTaxID); 

        if (existingItem) {
          await updateMondayItem(existingItem.id, itemName, columnValues);
        } else {
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