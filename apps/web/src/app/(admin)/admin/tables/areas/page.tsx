'use client';

import { useTenant } from '@/lib/tenant';
import { ResourceCrud } from '@/components/catalog/resource-crud';

/** Áreas do salão (M6, DOMAIN_MODEL.md §1.4) — ex.: Salão, Varanda. */
export default function AreasPage() {
  const tenant = useTenant();
  if (tenant.status !== 'ok') return null;

  return (
    <ResourceCrud
      tenantId={tenant.tenant.id}
      basePath="/v1/areas"
      entityLabel="Área"
      createLabel="Nova área (ex.: Salão, Varanda)"
    />
  );
}
