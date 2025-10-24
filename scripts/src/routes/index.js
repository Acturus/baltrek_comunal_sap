import { Router } from 'express';
import supplierRoutes from './v1/supplierRoutes.js'; // Importa las rutas de la v1

const router = Router();

// Middleware para todas las rutas API
router.use((_, res, next) => {
    // Puedes poner lógica de autenticación global aquí
    res.setHeader('X-API-Version', '1.0');
    next();
});

// Montar todas las rutas de la versión 1 bajo /v1
router.use('/v1', supplierRoutes); 

export default router;