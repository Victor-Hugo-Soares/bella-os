'use client';

import { useTenant } from '@/lib/tenant';
import { ResourceCrud } from '@/components/catalog/resource-crud';

/** Categorias do cardápio (M5, DOMAIN_MODEL.md §1.3). */
export default function CategoriesPage() {
  const tenant = useTenant();
  if (tenant.status !== 'ok') return null;

  return (
    <ResourceCrud
      tenantId={tenant.tenant.id}
      basePath="/v1/catalog/categories"
      entityLabel="Categoria"
      createLabel="Nova categoria (ex.: Entradas, Pratos Quentes)"
    />
  );
}
