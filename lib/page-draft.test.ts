import { describe, expect, it } from 'vitest';
import {
  diffPageBodies,
  hasServerDraft,
  pageBodyFrom,
  pageFromDraft,
  pagePublished,
  pageWithDraft,
} from './page-draft';
import type { Page, Section } from './types';

function page(partial: Partial<Page> = {}): Page {
  return {
    id: 'p1',
    slug: 'phones',
    title: 'Live title',
    description: 'Live desc',
    visible: true,
    sections: [
      {
        id: 's1',
        type: 'callback',
        visible: true,
        title: 'Live',
        buttonText: 'Go',
        placeholder: '',
      } as Section,
    ],
    ...partial,
  };
}

describe('page-draft', () => {
  it('stores draft without changing published body identity', () => {
    const live = page();
    const editor = page({
      title: 'Draft title',
      sections: [
        {
          id: 's2',
          type: 'callback',
          visible: true,
          title: 'Draft',
          buttonText: 'X',
          placeholder: '',
        } as Section,
      ],
    });
    const next = pageWithDraft(live, editor);
    expect(next.title).toBe('Live title');
    expect(next.draft?.title).toBe('Draft title');
    expect(next.draft?.sections?.[0].id).toBe('s2');
    expect(hasServerDraft(next)).toBe(true);
  });

  it('publish clears draft and applies editor body', () => {
    const editor = page({ title: 'New live', draft: { title: 'old', updatedAt: 'x' } });
    const pub = pagePublished(editor);
    expect(pub.title).toBe('New live');
    expect(pub.draft).toBeUndefined();
  });

  it('loads draft into working page', () => {
    const withDraft = page({
      draft: {
        title: 'From draft',
        description: 'D',
        sections: [],
        updatedAt: new Date().toISOString(),
      },
    });
    const loaded = pageFromDraft(withDraft);
    expect(loaded?.title).toBe('From draft');
    expect(loaded?.sections).toEqual([]);
  });
});

describe('diffPageBodies', () => {
  it('reports title and section changes', () => {
    const live = pageBodyFrom(page());
    const next = pageBodyFrom(
      page({
        title: 'New',
        sections: [
          {
            id: 's1',
            type: 'callback',
            visible: true,
            title: 'Changed',
            buttonText: 'Go',
            placeholder: '',
          } as Section,
          {
            id: 's9',
            type: 'hero',
            visible: true,
            titleHtml: 'H',
            aboutLines: [],
            callbackTitle: '',
            callbackButtonText: '',
            callbackPlaceholder: '',
            image: '/x.png',
            imageAlt: '',
          } as Section,
        ],
      }),
    );
    const lines = diffPageBodies(live, next);
    expect(lines.some((l) => l.field === 'Назва' && l.kind === 'changed')).toBe(true);
    expect(lines.some((l) => l.kind === 'added')).toBe(true);
  });

  it('is empty when equal', () => {
    const body = pageBodyFrom(page());
    expect(diffPageBodies(body, structuredClone(body))).toEqual([]);
  });
});
