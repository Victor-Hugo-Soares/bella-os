'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, QrCode } from 'lucide-react';
import { TenantProvider, useTenant } from '@/lib/tenant';
import { ApiError, apiFetch } from '@/lib/api';

interface Station {
  id: string;
  name: string;
}

/**
 * Pareamento de dispositivo KDS (M9) — só o essencial: escolher estação(ões) e gerar
 * o código de 6 dígitos que o tablet da cozinha digita em `/kds`. CRUD completo de
 * dispositivos (listar/revogar já existe na API desde o M3) fica para quando mais de
 * um tipo de dispositivo precisar de tela (ex.: caixa) — escopo cortado no M9.
 */
export default function DevicesPage() {
  return (
    <TenantProvider>
      <DevicesPageContent />
    </TenantProvider>
  );
}

function DevicesPageContent() {
  const tenant = useTenant();
  const tenantId = tenant.status === 'ok' ? tenant.tenant.id : null;

  const [stations, setStations] = useState<Station[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('KDS Cozinha');
  const [generating, setGenerating] = useState(false);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    apiFetch<{ stations: Station[] }>('/v1/catalog/stations', {
      headers: { 'x-tenant-id': tenantId },
    })
      .then((data) => setStations(data.stations))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar estações.');
      });
  }, [tenantId]);

  if (tenant.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-pulse rounded-full bg-elevated" />
      </div>
    );
  }
  if (tenant.status === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <p role="alert" className="flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
          {tenant.message}
        </p>
      </main>
    );
  }
  if (!tenantId) return null;

  function toggleStation(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    setGenerating(true);
    setError(null);
    setCode(null);
    try {
      const result = await apiFetch<{ code: string; expiresAt: string }>(
        '/v1/devices/pairing-codes',
        {
          method: 'POST',
          headers: { 'x-tenant-id': tenantId },
          body: JSON.stringify({
            deviceKind: 'kds',
            deviceName: name,
            stationIds: [...selected],
          }),
        },
      );
      setCode(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível gerar o código.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
          Dispositivos
        </p>
        <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground">
          Parear KDS
        </h1>
      </header>

      <main className="mx-auto max-w-lg px-6 py-8">
        {error ? (
          <p role="alert" className="mb-4 flex items-center gap-2 text-sm text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {error}
          </p>
        ) : null}

        {!stations ? (
          <div className="h-8 w-8 animate-pulse rounded-full bg-elevated" />
        ) : (
          <form onSubmit={handleGenerate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                Nome do dispositivo
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                Estações que este KDS atende
              </label>
              {stations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Cadastre uma estação primeiro em Catálogo → Estações.
                </p>
              ) : (
                <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
                  {stations.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleStation(s.id)}
                        className="h-4 w-4"
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={generating || selected.size === 0}
              className="flex items-center justify-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              ) : (
                <QrCode className="h-4 w-4" strokeWidth={1.5} />
              )}
              Gerar código de pareamento
            </button>
          </form>
        )}

        {code ? (
          <div className="mt-6 rounded-md border border-border bg-surface p-6 text-center">
            <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
              Código (válido por 10 min)
            </p>
            <p className="font-mono-tabular mt-2 text-3xl font-semibold text-foreground">
              {code.code}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Digite este código em <span className="font-mono-tabular">/kds</span> no tablet da
              cozinha.
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
