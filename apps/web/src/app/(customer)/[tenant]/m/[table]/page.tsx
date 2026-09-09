/**
 * Reservado desde o M4 (ADR-014) — cardápio do cliente real é da Fase B (M7).
 * Existe aqui só para provar a estrutura de rotas por superfície: `/{tenant}/m/{mesa}`
 * é o formato que o QR Code físico da mesa vai apontar (DOMAIN_MODEL.md).
 */
export default async function CustomerTablePlaceholderPage(
  props: PageProps<'/[tenant]/m/[table]'>,
) {
  const { tenant, table } = await props.params;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-sm text-muted-foreground">
        Cardápio do cliente ({tenant} / mesa {table}) — chega na Fase B.
      </p>
    </main>
  );
}
