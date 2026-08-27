'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  ClipboardList,
  FileText,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  List,
  Search,
  History,
  Settings,
  ShoppingCart,
  Star,
  Users,
} from 'lucide-react';
import { isFavorite, readFavorites, readRecents, toggleFavorite } from '@/lib/admin-recents';

type Cmd = {
  id: string;
  label: string;
  hint?: string;
  href?: string;
  keywords?: string;
  run?: () => void;
  group?: string;
};

const STATIC: Cmd[] = [
  { id: 'dash', label: 'Огляд', href: '/admin', keywords: 'dashboard home', group: 'Навігація' },
  { id: 'inbox', label: 'Inbox', href: '/admin/inbox', keywords: 'черга заявки orders', group: 'Навігація' },
  { id: 'leads', label: 'Заявки', href: '/admin/leads', keywords: 'callback дзвінок', group: 'Навігація' },
  { id: 'orders', label: 'Замовлення', href: '/admin/orders', keywords: 'shop', group: 'Навігація' },
  { id: 'clients', label: 'Клієнти', href: '/admin/clients', keywords: 'phone картка профіль', group: 'Навігація' },
  { id: 'menu', label: 'Меню', href: '/admin/menu', keywords: 'nav', group: 'Навігація' },
  { id: 'pages', label: 'Сторінки', href: '/admin/pages', keywords: 'cms', group: 'Навігація' },
  { id: 'goods', label: 'Товари', href: '/admin/goods', keywords: 'catalog shop', group: 'Навігація' },
  { id: 'services', label: 'Послуги', href: '/admin/services', keywords: 'salon manicure', group: 'Навігація' },
  { id: 'media', label: 'Медіатека', href: '/admin/media', keywords: 'upload images', group: 'Навігація' },
  { id: 'activity', label: 'Активність', href: '/admin/activity', keywords: 'audit log журнал', group: 'Навігація' },
  { id: 'ops', label: 'Ops runbook', href: '/admin/ops', keywords: 'аварія smtp backup emergency', group: 'Навігація' },
  { id: 'settings', label: 'Налаштування', href: '/admin/settings', keywords: 'seo backup 2fa', group: 'Навігація' },
  { id: 'site', label: 'Відкрити сайт', href: '/', keywords: 'public', group: 'Навігація' },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [dynamic, setDynamic] = useState<Cmd[]>([]);
  const [favs, setFavs] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ('');
    setActive(0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    setFavs(readFavorites());

    void (async () => {
      const cmds: Cmd[] = [];

      // Recents
      for (const r of readRecents()) {
        cmds.push({
          id: `recent-${r.href}`,
          label: r.label,
          hint: 'нещодавно',
          href: r.href,
          keywords: `recent ${r.label} ${r.href}`,
          group: 'Нещодавні',
        });
      }

      try {
        const res = await fetch('/api/site');
        if (res.ok) {
          const site = (await res.json()) as {
            pages?: Array<{ title: string; slug: string }>;
            goods?: Array<{ id: string; title: string; code?: string }>;
          };
          for (const p of site.pages || []) {
            cmds.push({
              id: `page-${p.slug || 'home'}`,
              label: `Сторінка: ${p.title}`,
              hint: p.slug ? `/${p.slug}` : '/',
              href: `/admin/pages/${p.slug || 'home'}`,
              keywords: `${p.title} ${p.slug} page`,
              group: 'Сторінки',
            });
          }
          for (const g of site.goods || []) {
            cmds.push({
              id: `good-${g.id}`,
              label: `Товар: ${g.title}`,
              hint: g.code || g.id.slice(0, 8),
              href: `/admin/goods?edit=${encodeURIComponent(g.id)}`,
              keywords: `${g.title} ${g.code || ''} product`,
              group: 'Товари',
            });
          }
        }
      } catch {
        /* ignore */
      }

      try {
        const res = await fetch('/api/media?sort=mtime');
        if (res.ok) {
          const json = (await res.json()) as {
            items?: Array<{ name: string; url: string; alt?: string }>;
          };
          for (const m of (json.items || []).slice(0, 40)) {
            cmds.push({
              id: `media-${m.name}`,
              label: `Медіа: ${m.alt || m.name}`,
              hint: m.name,
              href: '/admin/media',
              keywords: `media ${m.name} ${m.alt || ''}`,
              group: 'Медіа',
            });
          }
        }
      } catch {
        /* ignore */
      }

      setDynamic(cmds);
    })();
  }, [open]);

  const phoneCmd: Cmd | null = useMemo(() => {
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 6) {
      return {
        id: 'phone',
        label: `Знайти за телефоном: ${q.trim()}`,
        href: `/admin/inbox?phone=${encodeURIComponent(q.trim())}`,
        keywords: q,
        group: 'Пошук',
      };
    }
    return null;
  }, [q]);

  const favCmds: Cmd[] = useMemo(() => {
    return favs
      .map((href) => {
        const staticHit = STATIC.find((s) => s.href === href);
        if (staticHit) {
          return {
            ...staticHit,
            id: `fav-${href}`,
            group: 'Обране',
            hint: '★',
          };
        }
        return {
          id: `fav-${href}`,
          label: href,
          href,
          group: 'Обране',
          hint: '★',
          keywords: href,
        };
      })
      .filter(Boolean) as Cmd[];
  }, [favs]);

  const items = useMemo(() => {
    const all = [...favCmds, ...STATIC, ...dynamic, ...(phoneCmd ? [phoneCmd] : [])];
    // de-dupe by id
    const seen = new Set<string>();
    const unique = all.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    const query = q.trim().toLowerCase();
    if (!query) {
      // Prefer favs + recents + static nav
      return unique.filter((c) => c.group === 'Обране' || c.group === 'Нещодавні' || c.group === 'Навігація').slice(0, 16);
    }
    return unique
      .filter((c) => {
        const hay = `${c.label} ${c.hint || ''} ${c.keywords || ''}`.toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 16);
  }, [q, dynamic, phoneCmd, favCmds]);

  useEffect(() => {
    setActive(0);
  }, [q, open]);

  function go(cmd: Cmd) {
    if (cmd.run) cmd.run();
    else if (cmd.href) {
      if (cmd.href === '/') window.open('/', '_blank');
      else router.push(cmd.href);
    }
    close();
  }

  function star(href: string, e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setFavs(toggleFavorite(href));
  }

  if (!open) return null;

  return (
    <div className='admin-cmd-overlay' role='dialog' aria-modal='true' aria-label='Командна палітра'>
      <button type='button' className='admin-cmd-backdrop' aria-label='Закрити' onClick={close} />
      <div className='admin-cmd-panel'>
        <div className='admin-cmd-input-row'>
          <Search size={18} aria-hidden />
          <input
            ref={inputRef}
            className='admin-cmd-input'
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Пошук сторінок, товарів, медіа, розділів…'
            aria-label='Пошук'
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter' && items[active]) {
                e.preventDefault();
                go(items[active]);
              }
            }}
          />
          <kbd className='admin-cmd-kbd'>Esc</kbd>
        </div>
        <ul className='admin-cmd-list' role='listbox'>
          {items.length === 0 ? (
            <li className='admin-cmd-empty'>Нічого не знайдено</li>
          ) : (
            items.map((cmd, i) => (
              <li key={cmd.id}>
                <button
                  type='button'
                  className={`admin-cmd-item${i === active ? ' is-active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(cmd)}
                  role='option'
                  aria-selected={i === active}
                >
                  <CmdIcon id={cmd.id} group={cmd.group} />
                  <span className='admin-cmd-label'>
                    {cmd.group && cmd.group !== 'Навігація' ? (
                      <span className='admin-cmd-group'>{cmd.group} · </span>
                    ) : null}
                    {cmd.label}
                  </span>
                  {cmd.hint ? <span className='admin-cmd-hint'>{cmd.hint}</span> : null}
                  {cmd.href && cmd.href.startsWith('/admin') ? (
                    <span
                      role='button'
                      tabIndex={-1}
                      className={`admin-cmd-star${isFavorite(cmd.href) || favs.includes(cmd.href) ? ' is-on' : ''}`}
                      title='В обране'
                      onClick={(e) => star(cmd.href!, e)}
                      onKeyDown={() => {}}
                    >
                      <Star size={14} />
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <p className='admin-cmd-footer'>
          <kbd>↑↓</kbd> · <kbd>Enter</kbd> · ★ обране · <kbd>Ctrl+K</kbd>
        </p>
      </div>
    </div>
  );
}

function CmdIcon({ id, group }: { id: string; group?: string }) {
  const props = { size: 16, strokeWidth: 2, 'aria-hidden': true as const };
  if (group === 'Обране' || id.startsWith('fav-')) return <Star {...props} />;
  if (id === 'dash') return <LayoutDashboard {...props} />;
  if (id === 'inbox') return <Inbox {...props} />;
  if (id === 'leads') return <ClipboardList {...props} />;
  if (id === 'orders') return <ShoppingCart {...props} />;
  if (id === 'clients') return <Users {...props} />;
  if (id === 'menu') return <List {...props} />;
  if (id.startsWith('page') || id === 'pages') return <FileText {...props} />;
  if (id.startsWith('good') || id === 'goods') return <Box {...props} />;
  if (id.startsWith('media') || id === 'media') return <ImageIcon {...props} />;
  if (id === 'activity') return <History {...props} />;
  if (id === 'settings') return <Settings {...props} />;
  return <Search {...props} />;
}
