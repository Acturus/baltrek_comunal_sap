import express from 'express';
import dotenv from 'dotenv';
import apiRouter from './api/index.js';

// Cargar variables de entorno (asumiendo que .env existe)
dotenv.config(); 

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON
app.use(express.json());

// -----------------------------------------------------------------
// 1. Montar las Rutas de la API
// Esto significa que todas las rutas en apiRouter comenzarán con /api
app.use('/api', apiRouter); 
// -----------------------------------------------------------------


// Ruta de bienvenida o salud (opcional)
app.get('/', (req, res) => {
    res.send('API de Conexión SAP B1 Activa.');
});

// Middleware para manejar rutas no encontradas (404)
app.use((req, res, next) => {
    res.status(404).json({ 
        error: 'Not Found', 
        message: `Ruta ${req.originalUrl} no encontrada.` 
    });
});


// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Servidor Express escuchando en el puerto ${PORT}`);
    console.log(`======================================================\n`);
});