'use client';

import type { PhoneEntry, SiteData, SocialLink } from '@/lib/types';
import { saveSiteData } from '@/lib/admin/saveSite';
import { resolveSaveConflict } from '@/lib/admin/handleSaveResult';
import { useSaveShortcut, useUnsavedGuard } from '@/lib/admin/useUnsavedGuard';
import { createId } from '@/lib/id';
import { useCallback, useState } from 'react';
import { showToast } from './AdminToast';
import { BackupPanel } from './BackupPanel';
import { ImageField } from './ImageField';
import { TotpSetupPanel } from './TotpSetupPanel';
import { UsersPanel } from './UsersPanel';
import { StickySaveBar } from './StickySaveBar';
import { NotifyPrefsPanel } from './NotifyPrefsPanel';

const SOCIAL_PRESETS: Array<{ type: string; icon: string; label: string }> = [
  { type: 'viber', icon: '/img/icons/viber.svg', label: 'Viber' },
  { type: 'telegram', icon: '/img/icons/telegram.svg', label: 'Telegram' },
  { type: 'instagram', icon: '/img/icons/instagram.svg', label: 'Instagram' },
  { type: 'youtube', icon: '/img/icons/youtube.svg', label: 'YouTube' },
];

function emptyPhone(): PhoneEntry {
  return { display: '', tel: '' };
}

function emptySocial(type = 'telegram'): SocialLink {
  const preset = SOCIAL_PRESETS.find((p) => p.type === type) || SOCIAL_PRESETS[1];
  return { id: createId(), type: preset.type, url: '', icon: preset.icon };
}

export function SettingsEditor({ initialData }: { initialData: SiteData }) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const s = data.settings;

  useUnsavedGuard(dirty);

  const save = useCallback(async () => {
    setSaving(true);
    let result = await saveSiteData(data);
    if (!result.ok && result.conflict) {
      const forced = await resolveSaveConflict(data, result);
      if (forced) result = forced;
      else {
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    if (result.ok) {
      if (result.updatedAt) setData((prev) => ({ ...prev, updatedAt: result.updatedAt }));
      setDirty(false);
      showToast('Збережено', 'success');
    } else {
      showToast(result.error, 'error');
    }
  }, [data]);

  useSaveShortcut(save, { dirty, enabled: !saving });

  function patchSettings(patch: Partial<typeof s>) {
    setData({ ...data, settings: { ...s, ...patch } });
    setDirty(true);
  }

  function updatePhone(index: number, patch: Partial<PhoneEntry>) {
    const phones = [...(s.phones || [])];
    phones[index] = { ...phones[index], ...patch };
    patchSettings({ phones });
  }

  function updateSocial(index: number, patch: Partial<SocialLink>) {
    const social = [...(s.social || [])];
    social[index] = { ...social[index], ...patch };
    if (patch.type) {
      const preset = SOCIAL_PRESETS.find((p) => p.type === patch.type);
      if (preset && !patch.icon) {
        social[index] = { ...social[index], icon: preset.icon };
      }
    }
    patchSettings({ social });
  }

  return (
    <div className='admin-form'>
      <div className='admin-toolbar'>
        <button type='button' className='admin-btn' onClick={() => void save()} disabled={saving}>
          {saving ? 'Збереження…' : 'Зберегти'}
        </button>
        {dirty ? <span className='admin-dirty'>Є незбережені зміни · Ctrl+S</span> : null}
      </div>

      <div className='admin-card'>
        <h2 className='admin-h2'>Основне</h2>
        <label>
          Title (SEO / вкладка)
          <input value={s.title} onChange={(e) => patchSettings({ title: e.target.value })} />
        </label>
        <label>
          Description (meta)
          <textarea
            rows={2}
            value={s.description}
            onChange={(e) => patchSettings({ description: e.target.value })}
          />
        </label>
        <ImageField
          label='Логотип'
          value={s.logo}
          onChange={(url) => patchSettings({ logo: url })}
          preset='logo'
        />
        <ImageField
          label='Favicon'
          value={s.favicon}
          onChange={(url) => patchSettings({ favicon: url })}
          preset='logo'
        />
        <label>
          Години роботи (шапка)
          <input value={s.hours} onChange={(e) => patchSettings({ hours: e.target.value })} />
        </label>
        <label>
          Адреса
          <input value={s.address} onChange={(e) => patchSettings({ address: e.target.value })} />
        </label>
        <label>
          Примітка до адреси
          <input value={s.addressNote || ''} onChange={(e) => patchSettings({ addressNote: e.target.value })} />
        </label>
        <label>
          Години офісу
          <input value={s.officeHours || ''} onChange={(e) => patchSettings({ officeHours: e.target.value })} />
        </label>
        <label>
          Email
          <input value={s.email} onChange={(e) => patchSettings({ email: e.target.value })} />
        </label>
        <label>
          Copyright
          <input value={s.copyright} onChange={(e) => patchSettings({ copyright: e.target.value })} />
        </label>
        <label>
          Посилання на відгуки (Google тощо)
          <input
            value={s.reviewsUrl || ''}
            onChange={(e) => patchSettings({ reviewsUrl: e.target.value })}
            placeholder='https://g.page/...'
          />
        </label>
        <label>
          Map embed URL
          <input value={s.mapEmbedUrl || ''} onChange={(e) => patchSettings({ mapEmbedUrl: e.target.value })} />
        </label>
      </div>

      <div className='admin-card'>
        <h2 className='admin-h2'>Телефон у шапці (салон / головна)</h2>
        <div className='admin-row admin-row--wrap'>
          <label className='admin-grow'>
            Відображення
            <input
              value={s.headerPhone.display}
              onChange={(e) => patchSettings({ headerPhone: { ...s.headerPhone, display: e.target.value } })}
              placeholder='063 128 45 51'
            />
          </label>
          <label className='admin-grow'>
            tel: (для дзвінка)
            <input
              value={s.headerPhone.tel}
              onChange={(e) => patchSettings({ headerPhone: { ...s.headerPhone, tel: e.target.value } })}
              placeholder='+380...'
            />
          </label>
        </div>
      </div>

      <div className='admin-card'>
        <h2 className='admin-h2'>Телефон магазину / менеджер</h2>
        <p className='admin-hint admin-mb'>Показується в хедері й футері на сторінках магазину та кошика.</p>
        <div className='admin-row admin-row--wrap'>
          <label className='admin-grow'>
            Відображення
            <input
              value={s.shopPhone?.display || ''}
              onChange={(e) =>
                patchSettings({
                  shopPhone: { display: e.target.value, tel: s.shopPhone?.tel || '' },
                })
              }
              placeholder='093 632 72 24'
            />
          </label>
          <label className='admin-grow'>
            tel: (для дзвінка)
            <input
              value={s.shopPhone?.tel || ''}
              onChange={(e) =>
                patchSettings({
                  shopPhone: { display: s.shopPhone?.display || '', tel: e.target.value },
                })
              }
              placeholder='+380...'
            />
          </label>
        </div>
      </div>

      <div className='admin-card'>
        <div className='admin-row admin-row--between admin-mb'>
          <h2 className='admin-h2' style={{ margin: 0 }}>
            Додаткові телефони
          </h2>
          <button
            type='button'
            className='admin-btn admin-btn--secondary'
            onClick={() => patchSettings({ phones: [...(s.phones || []), emptyPhone()] })}
          >
            + Телефон
          </button>
        </div>
        <p className='admin-hint admin-mb'>Використовуються в блоках контактів / даних сайту.</p>
        {(s.phones || []).map((phone, i) => (
          <div key={i} className='admin-nested-card'>
            <div className='admin-row admin-row--wrap'>
              <label className='admin-grow'>
                Відображення
                <input value={phone.display} onChange={(e) => updatePhone(i, { display: e.target.value })} />
              </label>
              <label className='admin-grow'>
                tel:
                <input value={phone.tel} onChange={(e) => updatePhone(i, { tel: e.target.value })} />
              </label>
              <button
                type='button'
                className='admin-btn admin-btn--danger'
                onClick={() => patchSettings({ phones: (s.phones || []).filter((_, ii) => ii !== i) })}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        {!(s.phones || []).length ? <p className='admin-hint'>Немає додаткових телефонів.</p> : null}
      </div>

      <div className='admin-card'>
        <div className='admin-row admin-row--between admin-mb'>
          <h2 className='admin-h2' style={{ margin: 0 }}>
            Соцмережі / месенджери
          </h2>
          <button
            type='button'
            className='admin-btn admin-btn--secondary'
            onClick={() => patchSettings({ social: [...(s.social || []), emptySocial()] })}
          >
            + Посилання
          </button>
        </div>
        <p className='admin-hint admin-mb'>Іконки в шапці та мобільному меню.</p>
        {(s.social || []).map((link, i) => (
          <div key={link.id} className='admin-nested-card'>
            <div className='admin-row admin-row--wrap'>
              <label>
                Тип
                <select
                  className='admin-select'
                  value={SOCIAL_PRESETS.some((p) => p.type === link.type) ? link.type : 'telegram'}
                  onChange={(e) => updateSocial(i, { type: e.target.value })}
                >
                  {SOCIAL_PRESETS.map((p) => (
                    <option key={p.type} value={p.type}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className='admin-grow-2'>
                URL
                <input
                  value={link.url}
                  onChange={(e) => updateSocial(i, { url: e.target.value })}
                  placeholder='https://...'
                />
              </label>
              <button
                type='button'
                className='admin-btn admin-btn--danger'
                onClick={() => patchSettings({ social: (s.social || []).filter((_, ii) => ii !== i) })}
              >
                ×
              </button>
            </div>
            <ImageField
              label='Іконка'
              value={link.icon}
              onChange={(url) => updateSocial(i, { icon: url })}
              preset='logo'
            />
          </div>
        ))}
        {!(s.social || []).length ? <p className='admin-hint'>Немає соцмереж — додайте Viber/Telegram тощо.</p> : null}
      </div>

      <div className='admin-card'>
        <h2 className='admin-h2'>Політика конфіденційності</h2>
        <label>
          URL
          <input
            value={s.privacyPolicyUrl || ''}
            onChange={(e) => patchSettings({ privacyPolicyUrl: e.target.value })}
          />
        </label>
        <label>
          Текст посилання
          <input
            value={s.privacyPolicyText || ''}
            onChange={(e) => patchSettings({ privacyPolicyText: e.target.value })}
          />
        </label>
      </div>

      <TotpSetupPanel />

      <NotifyPrefsPanel />

      <UsersPanel />

      <div className='admin-card'>
        <h2 className='admin-h2'>Ops alerts</h2>
        <p className='admin-hint'>Перевірка backup &gt;48г та SMTP → Telegram (throttle 12 год).</p>
        <button
          type='button'
          className='admin-btn admin-btn--secondary'
          onClick={async () => {
            try {
              const res = await fetch('/api/ops-alerts', { method: 'POST' });
              const j = (await res.json().catch(() => ({}))) as { sent?: string[]; error?: string };
              if (!res.ok) {
                showToast(j.error || 'Помилка', 'error');
                return;
              }
              showToast(
                j.sent?.length ? `Надіслано: ${j.sent.join(', ')}` : 'Алертів немає / throttle',
                'success',
              );
            } catch {
              showToast('Мережева помилка', 'error');
            }
          }}
        >
          Запустити ops alerts
        </button>
      </div>

      <BackupPanel />

      <StickySaveBar dirty={dirty} saving={saving} onSave={() => void save()} />
    </div>
  );
}
