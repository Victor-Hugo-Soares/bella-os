import { CustomerMenu } from '@/components/customer/customer-menu';

/**
 * Cardápio do cliente (M7, DOMAIN_MODEL.md). `/{tenant}/m/{código}` é o formato que o
 * QR Code físico da mesa aponta (reservado desde o M4, ADR-014). Server component só
 * para extrair os params async do App Router; toda a lógica real (abrir sessão,
 * buscar catálogo, carrinho) é client-side em `CustomerMenu`.
 */
export default async function CustomerTablePage(props: PageProps<'/[tenant]/m/[table]'>) {
  const { tenant, table } = await props.params;
  return <CustomerMenu tenantSlug={tenant} tableCode={table} />;
}
