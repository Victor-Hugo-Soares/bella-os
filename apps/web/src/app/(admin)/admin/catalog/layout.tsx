'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertCircle, ChefHat, Layers, UtensilsCrossed } from 'lucide-react';
import { TenantProvider, useTenant } from '@/lib/tenant';

const TABS = [
  { href: '/admin/catalog/stations', label: 'Estações', icon: ChefHat },
  { href: '/admin/catalog/categories', label: 'Categorias', icon: Layers },
  { href: '/admin/catalog/products', label: 'Produtos', icon: UtensilsCrossed },
];

function CatalogShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const tenant = useTenant();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
          Catálogo
        </p>
        <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground">
          Cardápio
        </h1>
        {tenant.status === 'ok' ? (
          <p className="mt-1 text-sm text-muted-foreground">{tenant.tenant.name}</p>
        ) : null}
      </header>

      <nav className="flex gap-1 border-b border-border px-6">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-brand text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {tenant.status === 'loading' ? (
          <div className="h-8 w-8 animate-pulse rounded-full bg-elevated" />
        ) : tenant.status === 'error' ? (
          <p role="alert" className="flex items-center gap-2 text-sm text-danger">
            <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
            {tenant.message}
          </p>
        ) : tenant.status === 'empty' ? (
          <p className="text-sm text-muted-foreground">
            Nenhum tenant encontrado para este usuário.
          </p>
        ) : (
          children
        )}
      </main>
    </div>
  );
}

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <CatalogShell>{children}</CatalogShell>
    </TenantProvider>
  );
}
