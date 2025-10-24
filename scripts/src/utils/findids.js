// find_ids.js
import 'dotenv/config';
import mondaySdk from 'monday-sdk-js';

const monday = mondaySdk({ token: process.env.MONDAY_API_KEY });

// IMPORTANTE: Cambia este nombre si tu tablero se llama diferente
const BOARD_NAME = "PROVEEDORES";

async function findBoardIds() {
  console.log(`Buscando el tablero llamado "${BOARD_NAME}"...`);
  try {
    // Nota: La API de Monday no permite buscar tableros por nombre.
    // Vamos a traer varios tableros y filtrarlos.
    const query = `query {
      boards (limit: 100) {
        id
        name
        columns {
          id
          title
          type
        }
      }
    }`;
    
    const response = await monday.api(query);
    const boards = response.data.boards;
    
    const board = boards.find(b => b.name.trim().toLowerCase() === BOARD_NAME.trim().toLowerCase());

    if (!board) {
      console.error(`❌ Error: No se encontró ningún tablero con el nombre "${BOARD_NAME}".`);
      console.log('Tableros encontrados:', boards.map(b => b.name));
      return;
    }

    console.log(`\n🎉 ¡Tablero encontrado!`);
    console.log(`================================================`);
    console.log(`BOARD_ID: "${board.id}"`);
    console.log(`================================================\n`);
    console.log('IDs de Columnas (Copia esto en tu script sync.js):');
    
    const columnMap = {};
    board.columns.forEach(col => {
      console.log(`- "${col.title}": "${col.id}" (Tipo: ${col.type})`);
      // Mapeo simple para el log
      columnMap[col.title] = col.id;
    });

    console.log('\n// Objeto de mapeo para COLUMN_IDS:');
    console.log(JSON.stringify(columnMap, null, 2));

  } catch (err) {
    console.error("Error al conectar con la API de Monday:", err);
  }
}

findBoardIds();