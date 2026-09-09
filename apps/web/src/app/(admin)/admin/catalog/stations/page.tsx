'use client';

import { useTenant } from '@/lib/tenant';
import { ResourceCrud } from '@/components/catalog/resource-crud';

/**
 * Estações de produção (M5, DOMAIN_MODEL.md §1.3) — destino de cada produto (cozinha,
 * pizzaria, bar). O layout pai (`catalog/layout.tsx`) já garante `tenant.status === 'ok'`
 * antes de renderizar esta página.
 */
export default function StationsPage() {
  const tenant = useTenant();
  if (tenant.status !== 'ok') return null;

  return (
    <ResourceCrud
      tenantId={tenant.tenant.id}
      basePath="/v1/catalog/stations"
      entityLabel="Estação"
      createLabel="Nova estação (ex.: Cozinha, Bar)"
    />
  );
}
