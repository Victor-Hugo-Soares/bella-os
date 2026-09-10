// Schema Drizzle do Bella OS. Regra: toda tabela de negócio tem tenant_id NOT NULL
// e RLS ativada (ADR-004, ADR-021). Ver docs/DOMAIN_MODEL.md.
export * from './_rls';
export * from './platform';
export * from './identity';
export * from './platform-ops';
export * from './auth';
export * from './devices';
export * from './catalog';
export * from './tables';
export * from './orders';
