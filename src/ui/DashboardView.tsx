import { useUser } from '@clerk/clerk-react';
import { useState } from 'react';
import type { MeResponse } from '../data/api';
import { Notice } from './common';

interface Props {
  meData: MeResponse | null;
  meLoaded?: boolean;
}

function ProgressBar({ value, max, warn }: { value: number; max: number; warn?: boolean }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 90 ? 'var(--error, #ef4444)' : pct >= 70 ? 'var(--warn, #f5a623)' : 'var(--accent, #e05c2b)';
  return (
    <div className="fbar-track">
      <div className="fbar-fill" style={{ width: `${pct}%`, background: warn ? color : undefined }} />
    </div>
  );
}

export default function DashboardView({ meData }: Props) {
  const { user } = useUser();
  const [showBuy, setShowBuy] = useState(false);

  // meData is null only when the API call failed — show error, not infinite spinner
  if (!meData) {
    return (
      <div className="stack" style={{ maxWidth: 560 }}>
        <div className="page-head">
          <div>
            <div className="kicker">Dashboard</div>
            <h1>Minha conta</h1>
          </div>
        </div>
        <div className="panel">
          <div className="panel-pad">
            <Notice kind="error">
              Não foi possível carregar os dados da conta. Verifique sua conexão e atualize o app.
            </Notice>
          </div>
        </div>
      </div>
    );
  }

  const email = meData.email || user?.primaryEmailAddress?.emailAddress || '';
  const searches = meData.usage.searches;
  const previews = meData.usage.previews;
  const maxSearches = 200;
  const maxPreviews = 50;
  const searchPct = Math.min(100, (searches / maxSearches) * 100);
  const previewPct = Math.min(100, (previews / maxPreviews) * 100);

  const now = new Date();
  const renewal = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const renewalFormatted = renewal.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const daysInMonth = renewal.getDate() - 1 || new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getUTCDate();
  const monthPct = Math.round((dayOfMonth / daysInMonth) * 100);

  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <div className="page-head">
        <div>
          <div className="kicker">Dashboard</div>
          <h1>Minha conta</h1>
        </div>
      </div>

      {meData.dailySearches >= 20 && (
        <Notice kind="warn">
          Você já fez {meData.dailySearches} buscas hoje. Use com calma para não esgotar o mês.
        </Notice>
      )}

      {/* Créditos */}
      <div className="panel">
        <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Créditos do mês</strong>
          <span className="chip chip-muted">{meData.usage.month}</span>
        </div>
        <div className="panel-pad stack">

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14 }}>
              <span>Buscas de empresas</span>
              <span className="muted">{searches} / {maxSearches}</span>
            </div>
            <ProgressBar value={searches} max={maxSearches} warn />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              <span>{meData.remaining.searches} restantes</span>
              <span>{Math.round(searchPct)}% consumido</span>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14 }}>
              <span>Prévias publicadas</span>
              <span className="muted">{previews} / {maxPreviews}</span>
            </div>
            <ProgressBar value={previews} max={maxPreviews} warn />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              <span>{meData.remaining.previews} restantes</span>
              <span>{Math.round(previewPct)}% consumido</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Renova em <strong style={{ color: 'var(--ink)' }}>{renewalFormatted}</strong>
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>· Dia {dayOfMonth} de {new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ritmo de uso */}
      <div className="panel">
        <div className="panel-head"><strong>Ritmo de uso</strong></div>
        <div className="panel-pad stack">
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
            {monthPct}% do mês passou — você consumiu {Math.round(searchPct)}% das buscas.
          </div>
          {searchPct > monthPct + 20 && (
            <Notice kind="warn">
              Ritmo acima do mês: você usou {Math.round(searchPct)}% das buscas mas só {monthPct}% do mês passou. Reduza um pouco para não esgotar antes do dia {renewalFormatted}.
            </Notice>
          )}
          {searchPct <= monthPct + 20 && searchPct >= 1 && (
            <Notice kind="ok">
              Ritmo saudável. Você tem buscas suficientes para o restante do mês.
            </Notice>
          )}
        </div>
      </div>

      {/* Comprar créditos extras */}
      <div className="panel">
        <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Créditos extras</strong>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent, #e05c2b)' }}>R$59 · +200 buscas</span>
        </div>
        <div className="panel-pad stack">
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            Acabou as buscas antes do fim do mês? Compre 200 buscas extras por R$59 via Pix.
          </p>
          {!showBuy ? (
            <button className="btn btn-accent" onClick={() => setShowBuy(true)}>
              Comprar 200 buscas extras
            </button>
          ) : (
            <div style={{ background: 'var(--surf2)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, textAlign: 'center' }}>
              <p style={{ fontSize: 13, marginBottom: 12 }}>Envie uma mensagem para confirmar a compra:</p>
              <a
                href="https://wa.me/5548988078599?text=Olá%2C%20quero%20comprar%20200%20buscas%20extras%20por%20R%2459."
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-accent"
                style={{ display: 'inline-block' }}
              >
                Pagar via WhatsApp →
              </a>
              <button
                className="btn"
                style={{ marginLeft: 10 }}
                onClick={() => setShowBuy(false)}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Conta */}
      <div className="panel">
        <div className="panel-head"><strong>Conta</strong></div>
        <div className="panel-pad">
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>{email}</div>
        </div>
      </div>
    </div>
  );
}
