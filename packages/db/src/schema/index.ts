// Schema Drizzle do Bella OS. Regra: toda tabela de negócio tem tenant_id NOT NULL
// e RLS ativada (ADR-004, migration 0001). Ver docs/DOMAIN_MODEL.md.
export * from './_rls';
export * from './platform';
export * from './identity';
export * from './platform-ops';
