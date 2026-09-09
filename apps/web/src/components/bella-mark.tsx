/**
 * Monograma do Bella OS. Peça de marca própria (não emoji, não ícone de biblioteca
 * genérico) — usado no painel de login e na barra superior do admin. `currentColor`
 * para herdar `--foreground`/`--brand` do contexto onde é colocado.
 */
export function BellaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect
        x="0.75"
        y="0.75"
        width="30.5"
        height="30.5"
        rx="9.25"
        stroke="currentColor"
        strokeOpacity="0.14"
      />
      <path
        d="M11 9.5h6.4c2.7 0 4.35 1.34 4.35 3.6 0 1.62-.95 2.72-2.3 3.16 1.68.38 2.75 1.62 2.75 3.44 0 2.48-1.85 3.9-4.75 3.9H11V9.5Zm5.95 5.85c1.35 0 2.15-.62 2.15-1.78 0-1.13-.8-1.72-2.15-1.72h-3.2v3.5h3.2Zm.35 6c1.5 0 2.4-.68 2.4-1.94 0-1.24-.9-1.9-2.4-1.9h-3.55v3.84h3.55Z"
        fill="currentColor"
      />
    </svg>
  );
}
