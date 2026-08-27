'use client';

import { fetchSiteData, saveSiteData } from '@/lib/admin/saveSite';
import { useCallback, useEffect, useState } from 'react';
import { showToast } from './AdminToast';

interface BackupInfo {
  name: string;
  size: number;
  mtime: string;
}

/** Export / import + server-side rolling backups + restore. */
export function BackupPanel() {
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState<BackupInfo[]>([]);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch('/api/backup');
      if (!res.ok) return;
      const json = (await res.json()) as { backups?: BackupInfo[] };
      setBackups(json.backups || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function exportJson() {
    setBusy(true);
    try {
      const data = await fetchSiteData();
      if (!data) {
        showToast('Не вдалося завантажити дані', 'error');
        return;
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `site-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Backup завантажено', 'success');
    } finally {
      setBusy(false);
    }
  }

  async function snapshotNow() {
    setBusy(true);
    try {
      const res = await fetch('/api/backup', { method: 'POST' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(j.error || 'Помилка snapshot', 'error');
        return;
      }
      showToast('Snapshot створено на сервері', 'success');
      await loadList();
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup(name: string) {
    if (
      !confirm(
        `Відновити контент з «${name}»?\n\nПоточний стан спочатку збережеться як pre-restore snapshot. Увесь контент буде замінено.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', file: name }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(j.error || 'Помилка відновлення', 'error');
        return;
      }
      showToast('Відновлено — оновлення сторінки…', 'success');
      window.setTimeout(() => window.location.reload(), 700);
    } finally {
      setBusy(false);
    }
  }

  async function deleteBackup(name: string) {
    if (!confirm(`Видалити snapshot «${name}»?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/backup?file=${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!res.ok) {
        showToast('Не вдалося видалити', 'error');
        return;
      }
      showToast('Snapshot видалено', 'success');
      await loadList();
    } finally {
      setBusy(false);
    }
  }

  async function importJson(file: File) {
    if (
      !confirm(
        'Імпорт замінить УВЕСЬ поточний контент (сторінки, меню, товари, налаштування). Продовжити?',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        showToast('Файл не є валідним JSON', 'error');
        return;
      }
      const result = await saveSiteData(parsed as never);
      if (result.ok) {
        showToast('Імпорт успішний — оновіть сторінку', 'success');
        window.setTimeout(() => window.location.reload(), 800);
      } else {
        showToast(result.error, 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='admin-card admin-form'>
      <h2 className='admin-h2'>Backup (site.json)</h2>
      <p className='admin-hint admin-mb'>
        Autosave → <code>data/backups/</code> (ліміт BACKUP_KEEP, atomic write). Restore спочатку робить
        pre-restore snapshot.
      </p>
      <p className='admin-hint admin-mb admin-offsite-hint'>
        <strong>Off-site:</strong> snapshots на цьому ноутбуці не захищають від крадіжки/поломки диска.
        Раз на тиждень (або Task Scheduler): скопіюйте <code>data/</code> і{' '}
        <code>public/uploads/</code> на інший диск, SMB, OneDrive або{' '}
        <code>rclone sync</code>. Деталі — <code>docs/deploy.md</code>.
      </p>
      <div className='admin-row admin-row--wrap admin-mb'>
        <button type='button' className='admin-btn' disabled={busy} onClick={() => void exportJson()}>
          {busy ? '…' : '⬇ Експорт JSON'}
        </button>
        <button type='button' className='admin-btn admin-btn--secondary' disabled={busy} onClick={() => void snapshotNow()}>
          💾 Snapshot
        </button>
        <label className='admin-btn admin-btn--secondary admin-file-btn'>
          ⬆ Імпорт JSON
          <input
            type='file'
            accept='application/json,.json'
            hidden
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importJson(f);
            }}
          />
        </label>
        <button type='button' className='admin-btn admin-btn--secondary' disabled={busy} onClick={() => void loadList()}>
          Оновити список
        </button>
      </div>

      {backups.length ? (
        <ul className='admin-backup-list'>
          {backups.slice(0, 15).map((b) => (
            <li key={b.name} className='admin-backup-item'>
              <div>
                <a href={`/api/backup?file=${encodeURIComponent(b.name)}`} download={b.name}>
                  {b.name}
                </a>
                <span className='admin-hint'>
                  {' '}
                  · {(b.size / 1024).toFixed(1)} KB · {new Date(b.mtime).toLocaleString()}
                </span>
              </div>
              <div className='admin-row'>
                <button
                  type='button'
                  className='admin-btn admin-btn--secondary'
                  disabled={busy}
                  onClick={() => void restoreBackup(b.name)}
                >
                  Restore
                </button>
                <button
                  type='button'
                  className='admin-btn admin-btn--danger'
                  disabled={busy}
                  onClick={() => void deleteBackup(b.name)}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className='admin-hint'>Серверних snapshot ще немає — збережіть контент або натисніть Snapshot.</p>
      )}
    </div>
  );
}
