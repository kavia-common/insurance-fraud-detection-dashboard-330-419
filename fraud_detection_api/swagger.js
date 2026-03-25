const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Insurance Fraud Signal Detection API',
      version: '1.0.0',
      description:
        'Express API for CSV ingestion, fraud signal detection, investigator workflow (queue/outcomes), and reporting. Backed by Supabase Postgres.',
    },
  },
  apis: ['./src/routes/*.js'], // Path to the API docs (JSDoc in routes)
};

const swaggerSpec = swaggerJSDoc(options);
module.exports = swaggerSpec;
