import { Router } from 'express';
import { getSapSession, sapLogout } from '../../config/sapConnector.js';
import { getSupplierData } from '../../services/supplierService.js';

const router = Router();

// Define la ruta GET /api/v1/suppliers
router.get('/suppliers', async (_, res) =>
{
    let sapSession = null;
    
    try {
        // 1. Iniciar sesión en SAP
        sapSession = await getSapSession();
        
        if (!sapSession) {
            // Error de conexión ya fue loggeado en getSapSession
            return res.status(503).json({ 
                error: 'Service Unavailable', 
                message: 'No se pudo establecer conexión con el Service Layer de SAP B1.' 
            });
        }

        // 2. Obtener los datos (la lógica de negocio)
        const suppliers = await getSupplierData(sapSession);

        // 3. Devolver la respuesta
        if (suppliers) {
            return res.status(200).json({
                count: suppliers.length,
                data: suppliers
            });
        } else {
            // Error de consulta ya fue loggeado en getSupplierData
            return res.status(500).json({ 
                error: 'Internal Server Error', 
                message: 'Fallo al consultar los datos de proveedores.' 
            });
        }
    } catch (error) {
        console.error('Error en la ruta /suppliers:', error);
        return res.status(500).json({ 
            error: 'Internal Server Error', 
            message: 'Ocurrió un error inesperado en el servidor.' 
        });
    } finally {
        // 4. Cerrar sesión en SAP SIEMPRE, incluso si hubo un error
        await sapLogout(sapSession);
    }
});

export default router;