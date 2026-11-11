import { useEffect, useState } from 'react';

declare const __BUILD_ID__: string;

/**
 * Faixa no topo quando há uma versão nova publicada: compara o build em uso com /version.json
 * (ao abrir, ao voltar para o app e a cada 5 min). "Atualizar" baixa a versão nova e recarrega.
 */
export function UpdateBar() {
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        const { build } = (await res.json()) as { build?: string };
        if (alive && build && build !== __BUILD_ID__) setFresh(true);
      } catch {
        /* sem internet: tenta na próxima */
      }
    };
    check();
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    const t = setInterval(check, 5 * 60_000);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
      clearInterval(t);
    };
  }, []);

  async function update() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch {
      /* segue para o recarregamento mesmo assim */
    }
    window.location.reload();
  }

  if (!fresh) return null;
  return (
    <div className="update-bar" role="status">
      <span>Nova versão do Prospecta disponível.</span>
      <button className="btn btn-sm btn-accent" onClick={update} disabled={busy}>{busy ? 'Atualizando…' : 'Atualizar'}</button>
    </div>
  );
}

/** Atualização manual: apaga o cache do app e recarrega para pegar a versão mais nova (os leads ficam intactos). */
async function hardRefresh() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await window.caches?.keys()) ?? [];
    await Promise.all(keys.map((k) => window.caches.delete(k)));
  } catch {
    /* recarrega mesmo assim */
  }
  window.location.reload();
}

export function RefreshButton({ className = '' }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`refresh-btn ${className}`}
      title="Atualizar o app (baixa a versão mais nova; seus leads não são apagados)"
      aria-label="Atualizar o app"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void hardRefresh();
      }}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></svg>
      {busy ? 'Atualizando…' : 'Atualizar'}
    </button>
  );
}
