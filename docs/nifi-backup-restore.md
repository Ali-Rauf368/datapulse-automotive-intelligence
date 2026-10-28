# NiFi Flow Backup and Restore

DataPulse uses Apache NiFi 2.12.0 to ingest vehicle records into the DataPulse API and PostgreSQL database.

## Backup

1. Stop or pause the vehicle-ingestion process group before making changes.
2. Export or download the process group using the options available in the NiFi 2.12.0 UI. If NiFi Registry is configured, create and record a version there.
3. Store the exported flow in a secure backup location. Commit only sanitized flow definitions to Git.
4. Document the NiFi version, required extensions, controller services, parameter contexts, API endpoints, and database dependencies.
5. Record parameter names and configuration requirements, but never commit passwords, bearer tokens, private keys, or other secret values.
6. Record the backup date and verify that the exported flow can be imported.

## Restore

1. Confirm the target NiFi version and required extensions.
2. Import the saved process group or restore the appropriate NiFi Registry version.
3. Configure controller services and parameter contexts for the target environment. Use separate credentials for development and production.
4. Configure the DataPulse API endpoint and provision a valid machine credential.
5. Configure the InvokeHTTP processor to send the credential using an `Authorization: Bearer` header. Store the secret in an appropriate protected parameter or secret-management mechanism; never hard-code it in the flow or commit it to Git.
6. Start the process group in a controlled test environment and submit a safe test record.
7. Confirm the HTTP response and verify that the expected vehicle record exists in PostgreSQL.
8. Test unsuccessful HTTP responses, transport failures, retry limits, and failure routing before resuming normal ingestion.

## Failed Requests, Logging, and Retries

- Route non-success HTTP responses and transport failures to a failure path.
- Record the timestamp, flow name, HTTP status when available, and a sanitized error message.
- Never log passwords, bearer tokens, authorization headers, or other sensitive values.
- Retry only transient failures, using a bounded retry policy and an appropriate delay.
- Route requests that exhaust their retries to a review queue for investigation and controlled replay.
- Avoid unlimited retries. Before replaying a request, check whether it has already been processed to prevent duplicate vehicle creation.
- Monitor the failure queue and periodically review ingestion failures.

## Operational Checklist

- [ ] Flow definition or NiFi Registry version backed up
- [ ] NiFi version and required extensions documented
- [ ] Controller services and parameter names documented without secret values
- [ ] API endpoint and machine-credential provisioning documented
- [ ] Bearer token stored outside tracked flow definitions
- [ ] Restore tested in a non-production environment
- [ ] Successful ingestion verified against PostgreSQL
- [ ] HTTP error and transport-failure paths tested
- [ ] Retry limits and failure queue verified
- [ ] Duplicate handling checked before replaying failed requests
