'use client';

import type { PhoneEntry, Section, SiteData, SocialLink } from '@/lib/types';
import { createId } from '@/lib/id';
import { showToast } from '@/components/admin/AdminToast';
import { ImageField } from '@/components/admin/ImageField';
import { RichTextField } from '@/components/admin/RichTextField';

export const SOCIAL_TYPES = [
  { type: 'viber', icon: '/img/icons/viber.svg' },
  { type: 'telegram', icon: '/img/icons/telegram.svg' },
  { type: 'instagram', icon: '/img/icons/instagram.svg' },
  { type: 'facebook', icon: '/img/icons/facebook.svg' },
  { type: 'youtube', icon: '/img/icons/youtube.svg' },
] as const;

export interface SectionFieldEditorsProps {
  section: Section;
  index: number;
  patchSection: (index: number, patch: Partial<Section>) => void;
  settings: SiteData['settings'];
}

export function SectionFieldEditors({ section, index, patchSection, settings }: SectionFieldEditorsProps) {
  return (
    <>
      {section.type === 'hero' ? (
        <>
          <label>
            Заголовок (HTML)
            <textarea
              rows={2}
              value={section.titleHtml}
              onChange={e => patchSection(index, { titleHtml: e.target.value })}
            />
          </label>
          <RichTextField
            label='Заголовок (rich text)'
            value={section.titleHtml || ''}
            onChange={html => patchSection(index, { titleHtml: html })}
            rows={3}
            hint='Жирний / курсив / посилання. На сайті HTML санітизується.'
          />
          <label>
            Рядки «про сервіс» (кожен з нового рядка, HTML)
            <textarea
              rows={4}
              value={(section.aboutLines || []).join('\n')}
              onChange={e =>
                patchSection(index, {
                  aboutLines: e.target.value.split('\n'),
                })
              }
            />
          </label>
          <label>
            Заголовок форми
            <input
              value={section.callbackTitleHtml || section.callbackTitle || ''}
              onChange={e =>
                patchSection(index, {
                  callbackTitle: e.target.value,
                  callbackTitleHtml: e.target.value,
                })
              }
            />
          </label>
          <div className='admin-row admin-row--wrap'>
            <label className='admin-grow'>
              Текст кнопки
              <input
                value={section.callbackButtonText || ''}
                onChange={e => patchSection(index, { callbackButtonText: e.target.value })}
              />
            </label>
            <label className='admin-grow'>
              Placeholder телефону
              <input
                value={section.callbackPlaceholder || ''}
                onChange={e => patchSection(index, { callbackPlaceholder: e.target.value })}
              />
            </label>
          </div>
          <label>
            Активний slug у навігації послуг
            <input
              value={section.activeServiceSlug || ''}
              onChange={e => patchSection(index, { activeServiceSlug: e.target.value })}
              placeholder='напр. phones'
            />
          </label>
          <ImageField
            value={section.image}
            alt={section.imageAlt}
            onChange={url => patchSection(index, { image: url })}
            onAltChange={imageAlt => patchSection(index, { imageAlt })}
            preset='hero'
          />
        </>
      ) : null}

      {section.type === 'malfunctions' ? (
        <>
          <label>
            Заголовок
            <input value={section.title} onChange={e => patchSection(index, { title: e.target.value })} />
          </label>
          <label>
            Intro
            <input value={section.intro || ''} onChange={e => patchSection(index, { intro: e.target.value })} />
          </label>
          <label>
            Пункти (через ;)
            <textarea
              rows={3}
              value={section.items.join('; ')}
              onChange={e =>
                patchSection(index, {
                  items: e.target.value
                    .split(';')
                    .map(s => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <ImageField value={section.image} onChange={url => patchSection(index, { image: url })} preset='default' />
        </>
      ) : null}

      {section.type === 'advantages' ? (
        <>
          <div className='admin-subhead'>Переваги</div>
          {(section.items || []).map((item, i) => (
            <div key={i} className='admin-nested-card'>
              <ImageField
                label='Іконка'
                value={item.icon}
                onChange={url => {
                  const items = [...(section.items || [])];
                  items[i] = { ...items[i], icon: url };
                  patchSection(index, { items });
                }}
                preset='logo'
              />
              <label>
                Текст (HTML)
                <input
                  value={item.textHtml}
                  onChange={e => {
                    const items = [...(section.items || [])];
                    items[i] = { ...items[i], textHtml: e.target.value };
                    patchSection(index, { items });
                  }}
                />
              </label>
              <button
                type='button'
                className='admin-btn admin-btn--danger'
                onClick={() => {
                  const items = (section.items || []).filter((_, ii) => ii !== i);
                  patchSection(index, { items });
                }}
              >
                Видалити перевагу
              </button>
            </div>
          ))}
          <button
            type='button'
            className='admin-btn admin-btn--secondary'
            onClick={() => {
              const items = [
                ...(section.items || []),
                { icon: '/img/icons/descr_key.png', iconAlt: 'icon', textHtml: 'Нова перевага' },
              ];
              patchSection(index, { items });
            }}
          >
            + перевага
          </button>
        </>
      ) : null}

      {section.type === 'about-links' ? (
        <>
          <label>
            Заголовок (HTML)
            <input value={section.titleHtml || ''} onChange={e => patchSection(index, { titleHtml: e.target.value })} />
          </label>
          <label>
            Subtitle
            <input value={section.subtitle || ''} onChange={e => patchSection(index, { subtitle: e.target.value })} />
          </label>
          <div className='admin-subhead'>Посилання</div>
          {(section.items || []).map((item, i) => (
            <div key={i} className='admin-nested-card'>
              <label>
                Назва
                <input
                  value={item.label}
                  onChange={e => {
                    const items = [...(section.items || [])];
                    items[i] = { ...items[i], label: e.target.value };
                    patchSection(index, { items });
                  }}
                />
              </label>
              <label>
                Посилання
                <input
                  value={item.href}
                  onChange={e => {
                    const items = [...(section.items || [])];
                    items[i] = { ...items[i], href: e.target.value };
                    patchSection(index, { items });
                  }}
                />
              </label>
              <ImageField
                value={item.image}
                onChange={url => {
                  const items = [...(section.items || [])];
                  items[i] = { ...items[i], image: url };
                  patchSection(index, { items });
                }}
                preset='default'
              />
              <button
                type='button'
                className='admin-btn admin-btn--danger'
                onClick={() => {
                  const items = (section.items || []).filter((_, ii) => ii !== i);
                  patchSection(index, { items });
                }}
              >
                Видалити
              </button>
            </div>
          ))}
          <button
            type='button'
            className='admin-btn admin-btn--secondary'
            onClick={() => {
              const items = [
                ...(section.items || []),
                { href: '#', image: '/img/about-link/other.png', imageAlt: '', label: 'Новий' },
              ];
              patchSection(index, { items });
            }}
          >
            + посилання
          </button>
        </>
      ) : null}

      {section.type === 'feedback' ? (
        <>
          <label>
            Кнопка «більше»
            <input
              value={section.moreReviewsButtonText || ''}
              onChange={e => patchSection(index, { moreReviewsButtonText: e.target.value })}
            />
          </label>
          <div className='admin-subhead'>Зображення відгуків</div>
          <p className='admin-hint'>
            Слайдер фіксує розмір по найбільшому скріну. Краще однаковий кадр (орієнтир — найвищий, напр. з відповіддю
            власника).
          </p>
          {(section.images || []).map((img, i) => (
            <div key={i} className='admin-nested-card'>
              <ImageField
                value={img}
                onChange={url => {
                  const imgs = [...(section.images || [])];
                  imgs[i] = url;
                  patchSection(index, { images: imgs });
                }}
                preset='default'
              />
              <button
                type='button'
                className='admin-btn admin-btn--danger'
                onClick={() => {
                  const imgs = (section.images || []).filter((_, ii) => ii !== i);
                  patchSection(index, { images: imgs });
                }}
              >
                Видалити
              </button>
            </div>
          ))}
          <button
            type='button'
            className='admin-btn admin-btn--secondary'
            onClick={() => {
              const imgs = [...(section.images || []), '/img/feedback/feed-1.jpg'];
              patchSection(index, { images: imgs });
            }}
          >
            + зображення
          </button>
        </>
      ) : null}

      {section.type === 'contacts' ? (
        <>
          <label>
            Заголовок
            <input value={section.title} onChange={e => patchSection(index, { title: e.target.value })} />
          </label>
          <label>
            Invite text
            <input
              value={section.inviteText || ''}
              onChange={e => patchSection(index, { inviteText: e.target.value })}
            />
          </label>
          <label>
            Address HTML
            <textarea
              rows={2}
              value={section.addressHtml || ''}
              onChange={e => patchSection(index, { addressHtml: e.target.value })}
            />
          </label>
          <label>
            Email
            <input value={section.email || ''} onChange={e => patchSection(index, { email: e.target.value })} />
          </label>
          <label>
            Map embed URL
            <input
              value={section.mapEmbedUrl || ''}
              onChange={e => patchSection(index, { mapEmbedUrl: e.target.value })}
            />
          </label>
          <label className='admin-check'>
            <input
              type='checkbox'
              checked={Boolean(section.intentChooser)}
              onChange={e => patchSection(index, { intentChooser: e.target.checked })}
            />
            Вибір запис / товари (головна)
          </label>
          <p className='admin-hint admin-mb'>
            На головній показує «Що вас цікавить?» і відправляє заявку в Заявки або Замовлення.
          </p>

          <div className='admin-row admin-row--between admin-mb'>
            <div className='admin-subhead' style={{ margin: 0 }}>
              Телефони секції
            </div>
            <div className='admin-row'>
              <button
                type='button'
                className='admin-btn admin-btn--secondary'
                onClick={() => {
                  const fromSettings: PhoneEntry[] = [];
                  if (settings.headerPhone?.tel || settings.headerPhone?.display) {
                    fromSettings.push({ ...settings.headerPhone });
                  }
                  for (const p of settings.phones || []) {
                    if (!fromSettings.some(x => x.tel === p.tel)) fromSettings.push({ ...p });
                  }
                  patchSection(index, {
                    phones: fromSettings,
                    email: section.email || settings.email,
                    mapEmbedUrl: section.mapEmbedUrl || settings.mapEmbedUrl,
                    social: section.social?.length ? section.social : structuredClone(settings.social || []),
                    addressHtml:
                      section.addressHtml || [settings.address, settings.addressNote].filter(Boolean).join('<br/>'),
                  });
                  showToast('Підтягнуто з Налаштувань', 'info');
                }}
              >
                ↻ З налаштувань
              </button>
              <button
                type='button'
                className='admin-btn admin-btn--secondary'
                onClick={() =>
                  patchSection(index, {
                    phones: [...(section.phones || []), { display: '', tel: '' }],
                  })
                }
              >
                + Телефон
              </button>
            </div>
          </div>
          <p className='admin-hint admin-mb'>
            Якщо список порожній — на сайті покажуться телефони з Налаштувань. Картки людей (Наталія / Ірина) живуть у
            полі people секції і більше не зникають при збереженні.
          </p>
          {(section.phones || []).map((phone, pi) => (
            <div key={pi} className='admin-nested-card'>
              <div className='admin-row admin-row--wrap'>
                <label className='admin-grow'>
                  Відображення
                  <input
                    value={phone.display}
                    onChange={e => {
                      const phones = [...(section.phones || [])];
                      phones[pi] = { ...phones[pi], display: e.target.value };
                      patchSection(index, { phones });
                    }}
                  />
                </label>
                <label className='admin-grow'>
                  tel:
                  <input
                    value={phone.tel}
                    onChange={e => {
                      const phones = [...(section.phones || [])];
                      phones[pi] = { ...phones[pi], tel: e.target.value };
                      patchSection(index, { phones });
                    }}
                  />
                </label>
                <button
                  type='button'
                  className='admin-btn admin-btn--danger'
                  onClick={() =>
                    patchSection(index, {
                      phones: (section.phones || []).filter((_, ii) => ii !== pi),
                    })
                  }
                >
                  ×
                </button>
              </div>
            </div>
          ))}

          <div className='admin-row admin-row--between admin-mb'>
            <div className='admin-subhead' style={{ margin: 0 }}>
              Соцмережі секції
            </div>
            <button
              type='button'
              className='admin-btn admin-btn--secondary'
              onClick={() => {
                const preset = SOCIAL_TYPES[1];
                const item: SocialLink = {
                  id: createId(),
                  type: preset.type,
                  url: '',
                  icon: preset.icon,
                };
                patchSection(index, { social: [...(section.social || []), item] });
              }}
            >
              + Соцмережа
            </button>
          </div>
          {(section.social || []).map((link, si) => (
            <div key={link.id} className='admin-nested-card'>
              <div className='admin-row admin-row--wrap'>
                <label>
                  Тип
                  <select
                    className='admin-select'
                    value={link.type}
                    onChange={e => {
                      const type = e.target.value;
                      const preset = SOCIAL_TYPES.find(p => p.type === type);
                      const social = [...(section.social || [])];
                      social[si] = {
                        ...social[si],
                        type,
                        icon: preset?.icon || social[si].icon,
                      };
                      patchSection(index, { social });
                    }}
                  >
                    {SOCIAL_TYPES.map(p => (
                      <option key={p.type} value={p.type}>
                        {p.type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className='admin-grow'>
                  URL
                  <input
                    value={link.url}
                    onChange={e => {
                      const social = [...(section.social || [])];
                      social[si] = { ...social[si], url: e.target.value };
                      patchSection(index, { social });
                    }}
                  />
                </label>
                <button
                  type='button'
                  className='admin-btn admin-btn--danger'
                  onClick={() => {
                    const social = (section.social || []).filter((_, ii) => ii !== si);
                    patchSection(index, { social });
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </>
      ) : null}

      {section.type === 'callback' ? (
        <>
          <label>
            Заголовок
            <input
              value={section.titleHtml || section.title || ''}
              onChange={e => patchSection(index, { title: e.target.value, titleHtml: e.target.value })}
            />
          </label>
          <label>
            Текст кнопки
            <input
              value={section.buttonText || ''}
              onChange={e => patchSection(index, { buttonText: e.target.value })}
            />
          </label>
          <label>
            Placeholder телефону
            <input
              value={section.placeholder || ''}
              onChange={e => patchSection(index, { placeholder: e.target.value })}
            />
          </label>
        </>
      ) : null}

      {section.type === 'shop-grid' ? (
        <>
          <label>
            Заголовок
            <input value={section.title || ''} onChange={e => patchSection(index, { title: e.target.value })} />
          </label>
          <label>
            Підзаголовок
            <input value={section.subtitle || ''} onChange={e => patchSection(index, { subtitle: e.target.value })} />
          </label>
        </>
      ) : null}

      {section.type === 'doors-hero' ? (
        <>
          <p className='admin-hint'>Ліва половина — магазин, права — салон.</p>
          <label>
            Kicker
            <input value={section.kicker || ''} onChange={e => patchSection(index, { kicker: e.target.value })} />
          </label>
          <label>
            Заголовок
            <input value={section.title || ''} onChange={e => patchSection(index, { title: e.target.value })} />
          </label>
          <label>
            Підзаголовок
            <input value={section.subtitle || ''} onChange={e => patchSection(index, { subtitle: e.target.value })} />
          </label>
          <ImageField
            value={section.image}
            alt={section.imageAlt}
            onChange={url => patchSection(index, { image: url })}
            onAltChange={imageAlt => patchSection(index, { imageAlt })}
            preset='hero'
          />
          {(['left', 'right'] as const).map(side => (
            <div key={side} className='admin-nested-card'>
              <div className='admin-subhead'>{side === 'left' ? 'Ліва (магазин)' : 'Права (салон)'}</div>
              <label>
                Label
                <input
                  value={section[side].label}
                  onChange={e => patchSection(index, { [side]: { ...section[side], label: e.target.value } })}
                />
              </label>
              <label>
                Title
                <input
                  value={section[side].title}
                  onChange={e => patchSection(index, { [side]: { ...section[side], title: e.target.value } })}
                />
              </label>
              <label>
                Subtitle
                <input
                  value={section[side].subtitle}
                  onChange={e => patchSection(index, { [side]: { ...section[side], subtitle: e.target.value } })}
                />
              </label>
              <label>
                href
                <input
                  value={section[side].href}
                  onChange={e => patchSection(index, { [side]: { ...section[side], href: e.target.value } })}
                />
              </label>
              <label>
                CTA
                <input
                  value={section[side].cta}
                  onChange={e => patchSection(index, { [side]: { ...section[side], cta: e.target.value } })}
                />
              </label>
            </div>
          ))}
        </>
      ) : null}

      {section.type === 'zone-door' ? (
        <>
          <label>
            Сторона
            <select
              className='admin-select'
              value={section.side}
              onChange={e => patchSection(index, { side: e.target.value === 'right' ? 'right' : 'left' })}
            >
              <option value='left'>Ліва (магазин)</option>
              <option value='right'>Права (салон)</option>
            </select>
          </label>
          <label>
            Заголовок
            <input value={section.title} onChange={e => patchSection(index, { title: e.target.value })} />
          </label>
          <label>
            Підзаголовок
            <input value={section.subtitle} onChange={e => patchSection(index, { subtitle: e.target.value })} />
          </label>
          <label>
            href
            <input value={section.href} onChange={e => patchSection(index, { href: e.target.value })} />
          </label>
          <label>
            CTA
            <input value={section.cta} onChange={e => patchSection(index, { cta: e.target.value })} />
          </label>
          <ImageField value={section.image} onChange={url => patchSection(index, { image: url })} preset='hero' />
        </>
      ) : null}

      {section.type === 'services-grid' ? (
        <>
          <label>
            Заголовок
            <input value={section.title || ''} onChange={e => patchSection(index, { title: e.target.value })} />
          </label>
          <label>
            Категорія (порожньо = усі)
            <input value={section.category || ''} onChange={e => patchSection(index, { category: e.target.value })} />
          </label>
        </>
      ) : null}

      {section.type === 'price-list' ? (
        <>
          <label>
            Заголовок
            <input value={section.title || ''} onChange={e => patchSection(index, { title: e.target.value })} />
          </label>
          <label>
            Джерело
            <select
              className='admin-select'
              value={section.source}
              onChange={e => patchSection(index, { source: e.target.value === 'manual' ? 'manual' : 'catalog' })}
            >
              <option value='catalog'>Каталог послуг</option>
              <option value='manual'>Вручну</option>
            </select>
          </label>
          <label>
            Категорія каталогу
            <input value={section.category || ''} onChange={e => patchSection(index, { category: e.target.value })} />
          </label>
        </>
      ) : null}

      {section.type === 'gallery' ? (
        <>
          <label>
            Заголовок
            <input value={section.title || ''} onChange={e => patchSection(index, { title: e.target.value })} />
          </label>
          {(section.images || []).map((img, i) => (
            <ImageField
              key={i}
              value={img}
              onChange={url => {
                const images = [...(section.images || [])];
                images[i] = url;
                patchSection(index, { images });
              }}
            />
          ))}
          <button
            type='button'
            className='admin-btn admin-btn--secondary'
            onClick={() => patchSection(index, { images: [...(section.images || []), ''] })}
          >
            + фото
          </button>
        </>
      ) : null}

      {section.type === 'rich-text' ? (
        <RichTextField
          label='HTML'
          value={section.html || ''}
          onChange={html => patchSection(index, { html })}
          rows={8}
        />
      ) : null}
    </>
  );
}
