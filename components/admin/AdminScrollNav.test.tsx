// @vitest-environment jsdom
import React, { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { AdminScrollNav } from './AdminScrollNav';

describe('AdminScrollNav', () => {
  let containerEl: HTMLDivElement;
  let mockMain: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    // Provide matchMedia mock
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    // Mock .admin-main
    mockMain = document.createElement('main');
    mockMain.className = 'admin-main';
    Object.defineProperty(mockMain, 'clientHeight', { value: 600, writable: true, configurable: true });
    Object.defineProperty(mockMain, 'scrollHeight', { value: 600, writable: true, configurable: true });
    Object.defineProperty(mockMain, 'scrollTop', { value: 0, writable: true, configurable: true });
    mockMain.scrollTo = vi.fn();
    document.body.appendChild(mockMain);
  });

  it('remains hidden when content fits within container', async () => {
    const root = createRoot(containerEl);
    await act(async () => {
      root.render(<AdminScrollNav />);
    });

    const nav = containerEl.querySelector('.admin-scroll-nav');
    expect(nav).not.toBeNull();
    expect(nav?.classList.contains('is-visible')).toBe(false);
    expect(nav?.getAttribute('aria-hidden')).toBe('true');

    root.unmount();
  });

  it('shows dual arrows when container has scrollable content and updates button states', async () => {
    Object.defineProperty(mockMain, 'scrollHeight', { value: 2500, configurable: true });
    Object.defineProperty(mockMain, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(mockMain, 'scrollTop', { value: 0, configurable: true });

    const root = createRoot(containerEl);
    await act(async () => {
      root.render(<AdminScrollNav />);
    });

    const nav = containerEl.querySelector('.admin-scroll-nav');
    expect(nav?.classList.contains('is-visible')).toBe(true);

    const upBtn = containerEl.querySelector('.admin-scroll-btn--up') as HTMLButtonElement;
    const downBtn = containerEl.querySelector('.admin-scroll-btn--down') as HTMLButtonElement;

    // At top: Up is dimmed/disabled, Down is active
    expect(upBtn.disabled).toBe(true);
    expect(upBtn.classList.contains('is-dimmed')).toBe(true);
    expect(downBtn.disabled).toBe(false);
    expect(downBtn.classList.contains('is-dimmed')).toBe(false);

    // Scroll to middle
    Object.defineProperty(mockMain, 'scrollTop', { value: 600, configurable: true });
    await act(async () => {
      mockMain.dispatchEvent(new Event('scroll'));
    });

    // Middle: both up and down are enabled simultaneously
    expect(upBtn.disabled).toBe(false);
    expect(upBtn.classList.contains('is-dimmed')).toBe(false);
    expect(downBtn.disabled).toBe(false);
    expect(downBtn.classList.contains('is-dimmed')).toBe(false);

    // Scroll to bottom
    Object.defineProperty(mockMain, 'scrollTop', { value: 1900, configurable: true });
    await act(async () => {
      mockMain.dispatchEvent(new Event('scroll'));
    });

    // Bottom: Down is dimmed/disabled, Up is active
    expect(upBtn.disabled).toBe(false);
    expect(downBtn.disabled).toBe(true);
    expect(downBtn.classList.contains('is-dimmed')).toBe(true);

    root.unmount();
  });

  it('executes scrollTo top and bottom when clicked', async () => {
    Object.defineProperty(mockMain, 'scrollHeight', { value: 3000, configurable: true });
    Object.defineProperty(mockMain, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(mockMain, 'scrollTop', { value: 1000, configurable: true });

    const root = createRoot(containerEl);
    await act(async () => {
      root.render(<AdminScrollNav />);
    });

    const upBtn = containerEl.querySelector('.admin-scroll-btn--up') as HTMLButtonElement;
    const downBtn = containerEl.querySelector('.admin-scroll-btn--down') as HTMLButtonElement;

    await act(async () => {
      upBtn.click();
    });

    expect(mockMain.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'smooth',
    });

    await act(async () => {
      downBtn.click();
    });

    expect(mockMain.scrollTo).toHaveBeenCalledWith({
      top: 3000,
      left: 0,
      behavior: 'smooth',
    });

    root.unmount();
  });

  it('uses behavior auto when prefers-reduced-motion is active', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(mockMain, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(mockMain, 'clientHeight', { value: 500, configurable: true });
    Object.defineProperty(mockMain, 'scrollTop', { value: 500, configurable: true });

    const root = createRoot(containerEl);
    await act(async () => {
      root.render(<AdminScrollNav />);
    });

    const upBtn = containerEl.querySelector('.admin-scroll-btn--up') as HTMLButtonElement;
    await act(async () => {
      upBtn.click();
    });

    expect(mockMain.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'auto',
    });

    root.unmount();
  });
});
