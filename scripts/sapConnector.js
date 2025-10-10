import axios from 'axios';
import https from 'https';
import dotenv from 'dotenv';

// Cargar variables de entorno del archivo .env
dotenv.config();

// Obtener variables de entorno
const SERVICE_LAYER_URL = process.env.SAP_SERVICE_LAYER_URL;
const COMPANY_DB = process.env.SAP_COMPANY_DB;
const USERNAME = process.env.SAP_USERNAME;
const PASSWORD = process.env.SAP_PASSWORD;
const SECMETHOD = process.env.SEC_METHOD;

const agent = new https.Agent({
    rejectUnauthorized: false,
    secureProtocol: SECMETHOD,
});

/**
 * Realiza el login al Service Layer y retorna un objeto de sesión Axios configurado.
 * @returns {AxiosInstance | null} Objeto Axios con la cookie B1SESSION inyectada.
 */
export async function getSapSession() {
    const loginUrl = `${SERVICE_LAYER_URL}/Login`;
    const payload = {
        CompanyDB: COMPANY_DB,
        UserName: USERNAME,
        Password: PASSWORD,
    };

    try {
        const response = await axios.post(loginUrl, payload, {
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/json' },
            // Permite a Axios manejar los redirects y cookies, aunque se recomienda inyección manual
            maxRedirects: 0, 
        });

        // El Service Layer devuelve la cookie en el header 'set-cookie'
        const sessionCookie = response.headers['set-cookie'];
        
        if (!sessionCookie) {
            throw new Error('Login failed: No session cookie received.');
        }

        // Crear una nueva instancia de Axios con la cookie inyectada para reutilización
        const sapAxiosInstance = axios.create({
            baseURL: SERVICE_LAYER_URL,
            httpsAgent: agent,
            headers: {
                'Cookie': sessionCookie.join('; '), // Unir todas las cookies (B1SESSION y ROUTEID)
                'Content-Type': 'application/json'
            },
            // Asegurar que el certificado se ignore en todas las llamadas
            validateStatus: status => status >= 200 && status < 300,
        });

        console.log('✅ Login exitoso. Sesión establecida.');
        return sapAxiosInstance;

    } catch (error) {
        console.error('❌ Fallo al conectar con SAP B1:');
        if (error.response) {
            console.error(`Estado: ${error.response.status}`);
            console.error('Cuerpo del error:', error.response.data);
        } else if (error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || error.message.includes('SSL')) {
            console.error('Error SSL: Verifique si el servidor está usando TLS 1.0 o un certificado autofirmado.');
        } else {
            console.error(error.message);
        }
        return null;
    }
}

/**
 * Cierra la sesión activa de SAP B1.
 * @param {AxiosInstance} sessionInstance 
 */
export async function sapLogout(sessionInstance) {
    if (sessionInstance) {
        try {
            await sessionInstance.post('/Logout');
            console.log('🚪 Sesión de SAP B1 cerrada.');
        } catch (error) {
            console.warn('Advertencia: Error al cerrar la sesión, pero el proceso continúa.');
        }
    }
}