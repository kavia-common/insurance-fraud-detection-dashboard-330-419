const cors = require('cors');
const express = require('express');
const routes = require('./routes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../swagger');

// Initialize express app
const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.set('trust proxy', true);
app.use('/docs', swaggerUi.serve, (req, res, next) => {
  const host = req.get('host');           // may or may not include port
  let protocol = req.protocol;          // http or https

  const actualPort = req.socket.localPort;
  const hasPort = host.includes(':');
  
  const needsPort =
    !hasPort &&
    ((protocol === 'http' && actualPort !== 80) ||
     (protocol === 'https' && actualPort !== 443));
  const fullHost = needsPort ? `${host}:${actualPort}` : host;
  protocol = req.secure ? 'https' : protocol;

  const dynamicSpec = {
    ...swaggerSpec,
    servers: [
      {
        url: `${protocol}://${fullHost}`,
      },
    ],
  };
  swaggerUi.setup(dynamicSpec)(req, res, next);
});

/**
 * PUBLIC_INTERFACE
 * GET /openapi.json
 * Returns the OpenAPI 3.0 spec JSON used by Swagger UI.
 *
 * This endpoint is useful for quick smoke checks to confirm routes are registered
 * (e.g., POST /api/claims/upload) without depending on the Swagger UI HTML.
 */
app.get('/openapi.json', (req, res) => {
  res.status(200).json(swaggerSpec);
});

// Parse JSON request body
app.use(express.json());

// Mount routes
app.use('/', routes);

/**
 * Error handling middleware
 *
 * In non-production environments, include a safe subset of error details to
 * speed up debugging (e.g., Supabase schema/config issues during CSV upload).
 * In production, keep responses generic to avoid leaking internals.
 */
app.use((err, req, res, next) => {
  console.error(err);

  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const status = err?.statusCode || err?.status || 500;

  const payload = {
    status: 'error',
    message: isProd ? 'Internal Server Error' : (err?.message || 'Internal Server Error'),
  };

  if (!isProd) {
    payload.details = {
      name: err?.name,
      // stack is very helpful locally; omit in prod
      stack: err?.stack,
    };
  }

  res.status(status).json(payload);
});

module.exports = app;
