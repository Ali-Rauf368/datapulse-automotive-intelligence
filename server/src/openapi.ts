// OpenAPI 3.1 description of the DataPulse API, served at /api/docs.
const json = (schema: object) => ({ 'application/json': { schema } })
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
const error = (description: string) => ({ description, content: json(ref('Error')) })
const ok = (description: string, schema: object) => ({ description, content: json(schema) })
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }
const secured = [{ bearerAuth: [] }]
const standard = {
  401: error('Missing, invalid or expired token'),
  403: error('Role not allowed'),
}

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'DataPulse API',
    version: '1.0.0',
    description:
      'Automotive inventory, sales, service and analytics. Sign in with POST /api/auth/login, then use **Authorize** with the returned token.',
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Health' }, { name: 'Auth' }, { name: 'Vehicles' }, { name: 'Sales' },
    { name: 'Service' }, { name: 'Analytics' }, { name: 'Administration' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'User JWT from /api/auth/login, or a NiFi machine credential',
      },
    },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'operator', 'viewer'] },
        },
      },
      Session: { type: 'object', properties: { token: { type: 'string' }, user: ref('User') } },
      Vehicle: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          vin: { type: 'string', example: 'WVWZZZCDZRW123456' },
          make: { type: 'string', example: 'Volkswagen' },
          model: { type: 'string', example: 'Golf 8' },
          model_year: { type: 'integer', example: 2024 },
          status: { type: 'string', enum: ['active', 'sold', 'in_service'] },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      NewVehicle: {
        type: 'object',
        required: ['vin', 'make', 'model', 'model_year'],
        properties: {
          vin: { type: 'string', pattern: '^[A-HJ-NPR-Z0-9]{17}$' },
          make: { type: 'string', maxLength: 100 },
          model: { type: 'string', maxLength: 100 },
          model_year: { type: 'integer', minimum: 1886, maximum: 2100 },
          status: {
            type: 'string',
            enum: ['active', 'sold', 'in_service'],
            description: 'Machine credentials only; people always create active vehicles',
          },
        },
      },
      Sale: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          vehicle_id: { type: 'string' },
          amount: { type: 'string', example: '27450.00' },
          sold_at: { type: 'string', format: 'date-time' },
        },
      },
      ServiceJob: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          vehicle_id: { type: 'string' },
          status: { type: 'string', enum: ['open', 'in_progress', 'completed', 'cancelled'] },
          description: { type: 'string' },
          opened_at: { type: 'string', format: 'date-time' },
          completed_at: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      AuditEntry: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          actor_email: { type: ['string', 'null'] },
          actor_kind: { type: 'string', enum: ['user', 'machine', 'system'] },
          action: { type: 'string', example: 'sale.recorded' },
          entity: { type: 'string' },
          entity_id: { type: ['string', 'null'] },
          summary: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/api/health': { get: { tags: ['Health'], summary: 'API liveness', responses: { 200: { description: 'Running' } } } },
    '/api/health/db': {
      get: {
        tags: ['Health'],
        summary: 'Database readiness',
        responses: { 200: { description: 'Connected' }, 503: error('Database unavailable') },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account (always viewer)',
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['name', 'email', 'password'],
            properties: {
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
              password: { type: 'string', minLength: 6, description: '6–72 UTF-8 bytes' },
            },
          }),
        },
        responses: {
          201: ok('Account created', ref('Session')),
          400: error('Invalid input'),
          409: error('Email already registered'),
          429: error('Too many sign-ups from this address'),
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in',
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['email', 'password'],
            properties: { email: { type: 'string' }, password: { type: 'string' } },
          }),
        },
        responses: {
          200: ok('Signed in', ref('Session')),
          401: error('Invalid email or password'),
          429: error('Too many failed attempts (10 per 15 minutes)'),
        },
      },
    },
    '/api/auth/me': {
      get: { tags: ['Auth'], summary: 'Current user', security: secured, responses: { 200: ok('Profile', ref('User')), ...standard } },
    },
    '/api/vehicles': {
      get: {
        tags: ['Vehicles'],
        summary: 'List vehicles',
        security: secured,
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Matches VIN, make or model' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'sold', 'in_service'] } },
        ],
        responses: { 200: ok('Vehicles', { type: 'array', items: ref('Vehicle') }), ...standard },
      },
      post: {
        tags: ['Vehicles'],
        summary: 'Add a vehicle (admin, operator, NiFi)',
        security: secured,
        requestBody: { required: true, content: json(ref('NewVehicle')) },
        responses: {
          201: ok('Created', ref('Vehicle')),
          400: error('Invalid input'),
          409: error('VIN already exists'),
          ...standard,
        },
      },
    },
    '/api/vehicles/import': {
      post: {
        tags: ['Vehicles'],
        summary: 'Import up to 500 vehicles (admin, operator)',
        description: 'Each row is validated on its own; existing VINs are skipped. Valid rows are added in one transaction.',
        security: secured,
        requestBody: {
          required: true,
          content: json({ type: 'object', required: ['vehicles'], properties: { vehicles: { type: 'array', maxItems: 500, items: ref('NewVehicle') } } }),
        },
        responses: {
          200: {
            description: 'Per-row report: counts of created, duplicates and invalid, plus results[{row, vin, status, error?}]',
          },
          400: error('No rows or more than 500'),
          ...standard,
        },
      },
    },
    '/api/vehicles/stats': {
      get: { tags: ['Vehicles'], summary: 'Inventory KPIs', security: secured, responses: { 200: { description: 'Counts by status' }, ...standard } },
    },
    '/api/vehicles/{id}': {
      get: {
        tags: ['Vehicles'], summary: 'One vehicle', security: secured, parameters: [idParam],
        responses: { 200: ok('Vehicle', ref('Vehicle')), 404: error('Not found'), ...standard },
      },
      patch: {
        tags: ['Vehicles'],
        summary: 'Edit a vehicle (admin, operator)',
        description: 'Only supplied fields are validated. Status changes must match the vehicle history.',
        security: secured,
        parameters: [idParam],
        requestBody: { required: true, content: json(ref('NewVehicle')) },
        responses: { 200: ok('Updated', ref('Vehicle')), 404: error('Not found'), 409: error('Conflicts with history'), ...standard },
      },
      delete: {
        tags: ['Vehicles'], summary: 'Delete a vehicle without history (admin)', security: secured, parameters: [idParam],
        responses: { 200: { description: 'Deleted' }, 404: error('Not found'), 409: error('Has sales or service history'), ...standard },
      },
    },
    '/api/sales': {
      get: { tags: ['Sales'], summary: 'Latest 100 sales', security: secured, responses: { 200: ok('Sales', { type: 'array', items: ref('Sale') }), ...standard } },
      post: {
        tags: ['Sales'],
        summary: 'Record a sale (admin, operator)',
        security: secured,
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['vehicle_id', 'amount'],
            properties: {
              vehicle_id: { type: 'integer' },
              amount: { type: 'number', exclusiveMinimum: 0 },
              sold_at: { type: 'string', format: 'date-time' },
            },
          }),
        },
        responses: {
          201: ok('Recorded', ref('Sale')),
          404: error('Vehicle not found'),
          409: error('Already sold or has an open service job'),
          ...standard,
        },
      },
    },
    '/api/service': {
      get: { tags: ['Service'], summary: 'Latest 100 service jobs', security: secured, responses: { 200: ok('Jobs', { type: 'array', items: ref('ServiceJob') }), ...standard } },
      post: {
        tags: ['Service'],
        summary: 'Open a service job (admin, operator)',
        security: secured,
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['vehicle_id', 'description'],
            properties: { vehicle_id: { type: 'integer' }, description: { type: 'string', maxLength: 2000 } },
          }),
        },
        responses: { 201: ok('Opened', ref('ServiceJob')), 409: error('Vehicle is sold'), ...standard },
      },
    },
    '/api/service/{id}': {
      patch: {
        tags: ['Service'],
        summary: 'Change a job status (admin, operator)',
        security: secured,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            required: ['status'],
            properties: { status: { type: 'string', enum: ['open', 'in_progress', 'completed', 'cancelled'] } },
          }),
        },
        responses: { 200: ok('Updated', ref('ServiceJob')), 409: error('Job already closed'), ...standard },
      },
    },
    '/api/analytics/sales': { get: { tags: ['Analytics'], summary: 'Sales totals and last 7 days', security: secured, responses: { 200: { description: 'Sales analytics' }, ...standard } } },
    '/api/analytics/service': { get: { tags: ['Analytics'], summary: 'Service jobs by status', security: secured, responses: { 200: { description: 'Service analytics' }, ...standard } } },
    '/api/analytics/insights': {
      get: {
        tags: ['Analytics'],
        summary: 'Revenue by month, top makes, days in stock, service turnaround',
        description: 'Also returns the equal-length previous period, the percentage change in revenue and sales, and plain-language highlights.',
        security: secured,
        parameters: [{ name: 'range', in: 'query', schema: { type: 'string', enum: ['30', '90', '365', 'all'], default: '365' } }],
        responses: { 200: { description: 'Insights' }, ...standard },
      },
    },
    '/api/users': {
      get: { tags: ['Administration'], summary: 'List users (admin)', security: secured, responses: { 200: { description: 'Users' }, ...standard } },
    },
    '/api/users/{id}': {
      patch: {
        tags: ['Administration'],
        summary: 'Change role or access (admin)',
        security: secured,
        parameters: [idParam],
        requestBody: {
          required: true,
          content: json({
            type: 'object',
            properties: { role: { type: 'string', enum: ['admin', 'operator', 'viewer'] }, active: { type: 'boolean' } },
          }),
        },
        responses: { 200: { description: 'Updated' }, 409: error('Own account or last administrator'), ...standard },
      },
    },
    '/api/audit': {
      get: {
        tags: ['Administration'],
        summary: 'Audit trail (admin)',
        security: secured,
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
          { name: 'entity', in: 'query', schema: { type: 'string', enum: ['vehicle', 'sale', 'service_job', 'user'] } },
        ],
        responses: { 200: ok('Entries', { type: 'array', items: ref('AuditEntry') }), ...standard },
      },
    },
    '/api/operations/nifi-logs': {
      get: { tags: ['Administration'], summary: 'NiFi ingestion outcomes (admin)', security: secured, responses: { 200: { description: 'Logs' }, ...standard } },
    },
  },
}
