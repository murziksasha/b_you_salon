'use client';

import { useCallback, useEffect, useState } from 'react';
import { showToast } from './AdminToast';

type UserRow = {
  id: string;
  username: string;
  role: string;
  createdAt: string;
  disabled?: boolean;
};

type SessionRow = {
  id: string;
  fingerprint: string;
  username: string;
  role: string;
  createdAt: string;
  lastSeenAt: string;
  ip?: string;
};

export function UsersPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [currentFp, setCurrentFp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'operator' | 'editor' | 'owner'>('operator');
  const [ownerPassword, setOwnerPassword] = useState('');

  const load = useCallback(async () => {
    try {
      const [uRes, sRes] = await Promise.all([fetch('/api/users'), fetch('/api/sessions')]);
      if (uRes.status === 403 || sRes.status === 403) {
        setForbidden(true);
        return;
      }
      if (uRes.ok) {
        const json = (await uRes.json()) as { users?: UserRow[] };
        setUsers(json.users || []);
      }
      if (sRes.ok) {
        const json = (await sRes.json()) as {
          sessions?: SessionRow[];
          currentFingerprint?: string | null;
        };
        setSessions(json.sessions || []);
        setCurrentFp(json.currentFingerprint || null);
      }
    } catch {
      showToast('Не вдалося завантажити користувачів', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (forbidden) {
    return (
      <div className='admin-card'>
        <p className='admin-hint'>Керування користувачами доступне лише власнику (owner).</p>
      </div>
    );
  }

  async function createUser() {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role, ownerPassword }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      showToast(json.error || 'Помилка створення', 'error');
      return;
    }
    showToast('Користувача створено', 'success');
    setUsername('');
    setPassword('');
    await load();
  }

  async function removeUser(id: string) {
    if (!confirm('Видалити користувача?')) return;
    const res = await fetch('/api/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ownerPassword }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      showToast(json.error || 'Помилка', 'error');
      return;
    }
    showToast('Видалено', 'success');
    await load();
  }

  async function revokeAll() {
    if (!confirm('Відкликати всі інші сесії?')) return;
    const res = await fetch('/api/sessions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true, ownerPassword }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; revoked?: number };
    if (!res.ok) {
      showToast(json.error || 'Помилка', 'error');
      return;
    }
    showToast(`Відкликано: ${json.revoked ?? 0}`, 'success');
    await load();
  }

  return (
    <div className='admin-card'>
      <h2 className='admin-h2'>Користувачі та ролі</h2>
      <p className='admin-hint'>
        Опційно: multi-user через <code>data/admins.json</code>. Legacy вхід лише з{' '}
        <code>ADMIN_PASSWORD</code> лишається owner. Ролі: operator (inbox), editor (контент), owner
        (усе + backup/2FA).
      </p>

      <label className='admin-field admin-mb'>
        Пароль власника (step-up для чутливих дій)
        <input
          type='password'
          className='admin-grow'
          value={ownerPassword}
          onChange={(e) => setOwnerPassword(e.target.value)}
          autoComplete='current-password'
        />
      </label>

      {loading ? <p className='admin-hint'>Завантаження…</p> : null}

      <h3 className='admin-h3'>Список</h3>
      {!users.length ? (
        <p className='admin-hint'>Порожньо — працює лише ADMIN_PASSWORD (legacy admin).</p>
      ) : (
        <ul className='admin-leads-list'>
          {users.map((u) => (
            <li key={u.id} className='admin-lead-item'>
              <div className='admin-lead-main'>
                <strong>{u.username}</strong>
                <span className='admin-lead-meta'>
                  {u.role}
                  {u.disabled ? ' · disabled' : ''}
                </span>
              </div>
              <button
                type='button'
                className='admin-btn admin-btn--danger admin-btn--sm'
                onClick={() => void removeUser(u.id)}
              >
                Видалити
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className='admin-h3'>Новий користувач</h3>
      <div className='admin-row admin-row--wrap admin-mb'>
        <input
          className='admin-field-sm'
          placeholder='username'
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className='admin-field-sm'
          type='password'
          placeholder='password ≥8'
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <select
          className='admin-select'
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
        >
          <option value='operator'>operator</option>
          <option value='editor'>editor</option>
          <option value='owner'>owner</option>
        </select>
        <button type='button' className='admin-btn' onClick={() => void createUser()}>
          Створити
        </button>
      </div>

      <h3 className='admin-h3'>Сесії</h3>
      <div className='admin-row admin-mb'>
        <button type='button' className='admin-btn admin-btn--secondary' onClick={() => void revokeAll()}>
          Вийти скрізь (інші)
        </button>
      </div>
      <ul className='admin-leads-list'>
        {sessions.map((s) => (
          <li key={s.id} className='admin-lead-item'>
            <div className='admin-lead-main'>
              <strong>
                {s.username} ({s.role})
                {s.fingerprint === currentFp ? ' · ця сесія' : ''}
              </strong>
              <span className='admin-lead-meta'>
                {s.ip || '—'} · {new Date(s.lastSeenAt).toLocaleString('uk-UA')}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
