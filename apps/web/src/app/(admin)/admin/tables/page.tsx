'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Plus, QrCode } from 'lucide-react';
import { useTenant } from '@/lib/tenant';
import { ApiError, apiFetch } from '@/lib/api';

interface Area {
  id: string;
  name: string;
}
interface TableRow {
  id: string;
  label: string;
  seats: number;
  qrCode: string;
  areaId: string | null;
  isActive: boolean;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; tables: TableRow[]; areas: Area[] };

/**
 * Mesas (M6, DOMAIN_MODEL.md §1.4). Cada mesa recebe um `qr_code` curto e não
 * sequencial gerado pelo servidor (`@bella/domain generateTableCode`) — mostrado aqui
 * como a URL que vai para o QR físico da mesa. Geração de PDF em lote fica para depois
 * (ACTIVE_PLAN.md M6, escopo cortado); por ora a URL é copiável manualmente.
 */
export default function TablesPage() {
  const tenant = useTenant();
  const tenantId = tenant.status === 'ok' ? tenant.tenant.id : null;
  const tenantSlug = tenant.status === 'ok' ? tenant.tenant.slug : null;

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [label, setLabel] = useState('');
  const [seats, setSeats] = useState('4');
  const [areaId, setAreaId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function load(id: string) {
    setState({ status: 'loading' });
    try {
      const headers = { 'x-tenant-id': id };
      const [tablesRes, areasRes] = await Promise.all([
        apiFetch<{ tables: TableRow[] }>('/v1/tables?includeInactive=true', { headers }),
        apiFetch<{ areas: Area[] }>('/v1/areas', { headers }),
      ]);
      setState({ status: 'ok', tables: tablesRes.tables, areas: areasRes.areas });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Não foi possível carregar.',
      });
    }
  }

  useEffect(() => {
    if (tenantId) void load(tenantId);
  }, [tenantId]);

  if (!tenantId) return null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    setCreating(true);
    setCreateError(null);
    try {
      await apiFetch('/v1/tables', {
        method: 'POST',
        headers: { 'x-tenant-id': tenantId },
        body: JSON.stringify({
          label,
          seats: Number(seats),
          ...(areaId ? { areaId } : {}),
        }),
      });
      setLabel('');
      await load(tenantId);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Não foi possível criar.');
    } finally {
      setCreating(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded-md bg-elevated" />
        ))}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <p role="alert" className="flex items-center gap-2 text-sm text-danger">
        <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
        {state.message}
      </p>
    );
  }

  return (
    <div>
      <form onSubmit={handleCreate} className="mb-6 grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
            Mesa
          </label>
          <input
            required
            placeholder="Mesa 12"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
            Lugares
          </label>
          <input
            required
            type="number"
            min={1}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            className="font-mono-tabular rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
            Área (opcional)
          </label>
          <select
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            className="rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Sem área</option>
            {state.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="col-span-3 flex items-center justify-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          ) : (
            <Plus className="h-4 w-4" strokeWidth={2} />
          )}
          Adicionar mesa
        </button>
      </form>
      {createError ? (
        <p role="alert" className="mb-4 flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          {createError}
        </p>
      ) : null}

      {state.tables.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma mesa cadastrada ainda.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface">
          {state.tables.map((table) => (
            <li key={table.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <span
                  className={`text-sm ${table.isActive ? 'text-foreground' : 'text-muted-foreground line-through'}`}
                >
                  {table.label}
                </span>
                <span className="ml-3 text-sm text-muted-foreground">{table.seats} lugares</span>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <QrCode className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span className="font-mono-tabular">
                  /{tenantSlug}/m/{table.qrCode}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
