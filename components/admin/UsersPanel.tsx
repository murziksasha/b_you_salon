'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ADMIN_CAPABILITY_GROUPS,
  ADMIN_CAPABILITY_LABELS,
  GRANTABLE_CAPABILITIES,
  presetGrants,
  roleFromPreset,
  type AdminCapability,
  type AdminPreset,
  type AdminRole,
} from '@/lib/admin-roles';
import { showToast } from './AdminToast';
import { useAdminRole } from './AdminRoleContext';

type UserRow = {
  id: string;
  username: string;
  role: AdminRole;
  grants?: AdminCapability[];
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

function grantsForPreset(preset: AdminPreset): AdminCapability[] {
  if (preset === 'owner') return [...GRANTABLE_CAPABILITIES];
  return presetGrants(preset);
}

function inferPreset(user: UserRow): AdminPreset {
  if (user.role === 'owner') return 'owner';
  const grants = user.grants ?? presetGrants(user.role);
  const op = presetGrants('operator');
  const ed = presetGrants('editor');
  const same = (a: AdminCapability[], b: AdminCapability[]) =>
    a.length === b.length && a.every((x) => b.includes(x));
  if (user.role === 'operator' && same(grants, op)) return 'operator';
  if (same(grants, ed)) return 'editor';
  return user.role === 'operator' ? 'operator' : 'editor';
}

function GrantBoxes({
  preset,
  grants,
  disabled,
  onToggle,
}: {
  preset: AdminPreset;
  grants: AdminCapability[];
  disabled?: boolean;
  onToggle: (key: AdminCapability, on: boolean) => void;
}) {
  const locked = preset === 'owner' || disabled;
  return (
    <div className='admin-perm-groups'>
      {ADMIN_CAPABILITY_GROUPS.map((group) => (
        <div key={group.id} className='admin-perm-group'>
          <p className='admin-hint'>{group.label}</p>
          <div className='admin-perm-grid'>
            {group.keys.map((key) => (
              <label key={key} className='admin-check'>
                <input
                  type='checkbox'
                  checked={preset === 'owner' || grants.includes(key)}
                  disabled={locked}
                  onChange={(e) => onToggle(key, e.target.checked)}
                />
                {ADMIN_CAPABILITY_LABELS[key]}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function UsersPanel() {
  const { can } = useAdminRole();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [currentFp, setCurrentFp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [preset, setPreset] = useState<AdminPreset>('operator');
  const [grants, setGrants] = useState<AdminCapability[]>(() => grantsForPreset('operator'));
  const [ownerPassword, setOwnerPassword] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPreset, setEditPreset] = useState<AdminPreset>('operator');
  const [editGrants, setEditGrants] = useState<AdminCapability[]>([]);
  const [editPassword, setEditPassword] = useState('');
  const [editDisabled, setEditDisabled] = useState(false);

  const load = useCallback(async () => {
    try {
      const [uRes, sRes] = await Promise.all([fetch('/api/users'), fetch('/api/sessions')]);
      if (uRes.status === 403) {
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

  const enabledOwners = useMemo(
    () => users.filter((u) => u.role === 'owner' && !u.disabled).length,
    [users],
  );

  if (!can('users') || forbidden) {
    return (
      <div className='admin-card'>
        <p className='admin-hint'>Керування користувачами доступне лише супер-адміну.</p>
      </div>
    );
  }

  async function createUser() {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        role: roleFromPreset(preset),
        grants: preset === 'owner' ? undefined : grants,
        ownerPassword,
      }),
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

  function startEdit(u: UserRow) {
    setEditingId(u.id);
    const p = inferPreset(u);
    setEditPreset(p);
    setEditGrants(u.role === 'owner' ? [...GRANTABLE_CAPABILITIES] : [...(u.grants ?? presetGrants(u.role))]);
    setEditPassword('');
    setEditDisabled(Boolean(u.disabled));
  }

  async function saveEdit() {
    if (!editingId) return;
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingId,
        role: roleFromPreset(editPreset),
        grants: editPreset === 'owner' ? undefined : editGrants,
        disabled: editDisabled,
        password: editPassword || undefined,
        ownerPassword,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      showToast(json.error || 'Помилка збереження', 'error');
      return;
    }
    showToast('Збережено', 'success');
    setEditingId(null);
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
    if (editingId === id) setEditingId(null);
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

  function applyPreset(next: AdminPreset, target: 'create' | 'edit') {
    if (target === 'create') {
      setPreset(next);
      setGrants(grantsForPreset(next));
    } else {
      setEditPreset(next);
      setEditGrants(grantsForPreset(next));
    }
  }

  return (
    <div className='admin-card'>
      <h2 className='admin-h2'>Користувачі та права</h2>
      <p className='admin-hint'>
        Супер-адмін має повний доступ. Інших можна створити з шаблоном (оператор / редактор / повний) і потім
        увімкнути окремі розділи. «Повний доступ» — усе, крім керування користувачами, відновлення бекапу та
        безпеки власника. Останнього супер-адміна зняти не можна ({enabledOwners} зараз).
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
                  {u.role === 'owner' ? 'супер-адмін' : u.role}
                  {u.disabled ? ' · disabled' : ''}
                  {u.role !== 'owner' && u.grants?.length ? ` · ${u.grants.length} прав` : ''}
                </span>
              </div>
              <div className='admin-row'>
                <button
                  type='button'
                  className='admin-btn admin-btn--secondary admin-btn--sm'
                  onClick={() => startEdit(u)}
                >
                  Права
                </button>
                <button
                  type='button'
                  className='admin-btn admin-btn--danger admin-btn--sm'
                  onClick={() => void removeUser(u.id)}
                >
                  Видалити
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editingId ? (
        <>
          <h3 className='admin-h3'>Редагувати</h3>
          <div className='admin-row admin-row--wrap admin-mb'>
            <select
              className='admin-select'
              value={editPreset}
              onChange={(e) => applyPreset(e.target.value as AdminPreset, 'edit')}
            >
              <option value='operator'>Оператор</option>
              <option value='editor'>Редактор</option>
              <option value='full'>Повний доступ</option>
              <option value='owner'>Супер-адмін</option>
            </select>
            <label className='admin-check'>
              <input
                type='checkbox'
                checked={editDisabled}
                onChange={(e) => setEditDisabled(e.target.checked)}
              />
              Вимкнено
            </label>
            <input
              className='admin-field-sm'
              type='password'
              placeholder='новий пароль (опційно)'
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
            />
            <button type='button' className='admin-btn' onClick={() => void saveEdit()}>
              Зберегти
            </button>
            <button type='button' className='admin-btn admin-btn--secondary' onClick={() => setEditingId(null)}>
              Скасувати
            </button>
          </div>
          <GrantBoxes
            preset={editPreset}
            grants={editGrants}
            onToggle={(key, on) =>
              setEditGrants((prev) => (on ? [...prev, key] : prev.filter((g) => g !== key)))
            }
          />
        </>
      ) : null}

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
          value={preset}
          onChange={(e) => applyPreset(e.target.value as AdminPreset, 'create')}
        >
          <option value='operator'>Оператор</option>
          <option value='editor'>Редактор</option>
          <option value='full'>Повний доступ</option>
          <option value='owner'>Супер-адмін</option>
        </select>
        <button type='button' className='admin-btn' onClick={() => void createUser()}>
          Створити
        </button>
      </div>
      <GrantBoxes
        preset={preset}
        grants={grants}
        onToggle={(key, on) => setGrants((prev) => (on ? [...prev, key] : prev.filter((g) => g !== key)))}
      />

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
