import { useUser } from '@clerk/clerk-react';
import type { MeResponse } from '../data/api';
import { Icon, Notice } from './common';

interface Props {
  meData: MeResponse | null;
}

export default function DashboardView({ meData }: Props) {
  const { user } = useUser();

  if (!meData) {
    return (
      <div className="empty">
        <span className="spinner" style={{ width: 24, height: 24 }} />
      </div>
    );
  }

  const email = meData.email || user?.primaryEmailAddress?.emailAddress || '';

  const searchPct = Math.min(100, (meData.usage.searches / 200) * 100);
  const previewPct = Math.min(100, (meData.usage.previews / 50) * 100);

  const now = new Date();
  const renewal = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const renewalFormatted = renewal.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <div className="page-head">
        <div>
          <div className="kicker">Dashboard</div>
          <h1>Minha conta</h1>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <strong>{email}</strong>
        </div>
        <div className="panel-pad stack">
          {meData.dailySearches >= 20 && (
            <Notice kind="warn">
              Você já fez {meData.dailySearches} buscas hoje. Use com calma para não esgotar o mês.
            </Notice>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14 }}>
              <span>Buscas este mês</span>
              <span className="muted">{meData.usage.searches} de 200</span>
            </div>
            <div className="fbar-track">
              <div className="fbar-fill" style={{ width: `${searchPct}%` }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {meData.remaining.searches} restantes
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14 }}>
              <span>Prévias este mês</span>
              <span className="muted">{meData.usage.previews} de 50</span>
            </div>
            <div className="fbar-track">
              <div className="fbar-fill" style={{ width: `${previewPct}%` }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              {meData.remaining.previews} restantes
            </div>
          </div>

          <div style={{ fontSize: 14, color: 'var(--muted)' }}>
            Saldo renova em <strong style={{ color: 'var(--ink)' }}>{renewalFormatted}</strong>
          </div>

          <div style={{ paddingTop: 4 }}>
            <a
              className="btn btn-wa"
              href="https://wa.me/5500000000000"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="wa" /> Falar com suporte
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
