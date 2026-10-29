import { Router } from 'express'
import { openApiDocument } from '../openapi.ts'

export const docsRouter = Router()

docsRouter.get('/openapi.json', (_req, res) => {
  res.json(openApiDocument)
})

// Swagger UI from a pinned CDN release, so the API needs no extra dependency.
const SWAGGER_UI = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14'

docsRouter.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>DataPulse API documentation</title>
    <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${SWAGGER_UI}/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({ url: '/api/docs/openapi.json', dom_id: '#swagger-ui', persistAuthorization: true })
    </script>
  </body>
</html>`)
})
