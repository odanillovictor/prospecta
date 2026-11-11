import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Notice, fmtDate } from './common';

interface UserRow {
  clerkId: string;
  email: string;
  active: number;
  searches: number;
  previews: number;
  createdAt: string;
}

export default function AdminView() {
  const { getToken } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = (await res.json()) as { users: UserRow[] };
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadUsers(); }, []);

  async function toggle(u: UserRow) {
    setToggling(u.clerkId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${u.clerkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active: u.active === 1 ? 0 : 1 }),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar cliente');
    } finally {
      setToggling(null);
    }
  }

  const activeCount = users.filter((u) => u.active === 1).length;

  if (loading) return <div style={{ padding: 24 }}><span className="spinner" /></div>;
  if (error) return <div style={{ padding: 24 }}><Notice kind="error">{error}</Notice></div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <h2 style={{ marginBottom: 16 }}>Clientes</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            <th style={th}>E-mail</th>
            <th style={th}>Status</th>
            <th style={th}>Buscas/mês</th>
            <th style={th}>Prévias/mês</th>
            <th style={th}>Cadastro</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.clerkId} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={td}>{u.email}</td>
              <td style={td}>
                <span style={{ color: u.active === 1 ? 'var(--ok)' : 'var(--muted)' }}>
                  {u.active === 1 ? 'Ativo' : 'Inativo'}
                </span>
              </td>
              <td style={{ ...td, textAlign: 'right' }}>{u.searches}</td>
              <td style={{ ...td, textAlign: 'right' }}>{u.previews}</td>
              <td style={td}>{fmtDate(u.createdAt)}</td>
              <td style={td}>
                <button
                  className="btn btn-sm"
                  disabled={toggling === u.clerkId}
                  onClick={() => void toggle(u)}
                >
                  {toggling === u.clerkId ? <span className="spinner" /> : (u.active === 1 ? 'Desativar' : 'Ativar')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>
        <strong>{activeCount}</strong> cliente{activeCount === 1 ? '' : 's'} ativo{activeCount === 1 ? '' : 's'}
      </p>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '2px solid var(--border)',
  whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '8px 10px',
  verticalAlign: 'middle',
};
