import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/leads', () => ({
  appendLead: vi.fn(),
  findOpenLeadsByPhone: vi.fn(),
  updateLead: vi.fn(),
}));

vi.mock('@/lib/telegram-auto-notify', () => ({
  autoNotifyNewLead: vi.fn(async () => {}),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

import nodemailer from 'nodemailer';
import { appendLead, findOpenLeadsByPhone } from '@/lib/leads';
import { POST } from './route';

describe('POST /api/contact', () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
    vi.clearAllMocks();
    vi.mocked(findOpenLeadsByPhone).mockResolvedValue([]);
    vi.mocked(appendLead).mockResolvedValue({
      id: 'lead-test-1',
      phone: '+380501234567',
      emailed: false,
      handled: false,
      source: 'booking',
      createdAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('does not send mail when MAIL_TO is missing', async () => {
    process.env.SMTP_USER = 'test@example.com';
    process.env.SMTP_PASS = 'secret';
    delete process.env.MAIL_TO;

    const sendMail = vi.fn();
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as any);

    const req = new NextRequest('http://localhost:3001/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '+380501234567' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.emailed).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
    expect(appendLead).toHaveBeenCalled();
  });

  it('does not send mail when SMTP creds are missing', async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    process.env.MAIL_TO = 'admin@example.com';

    const sendMail = vi.fn();
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as any);

    const req = new NextRequest('http://localhost:3001/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '+380501234567' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.emailed).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
