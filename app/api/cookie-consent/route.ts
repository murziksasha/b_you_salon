import { NextRequest, NextResponse } from 'next/server';
import {
  CONSENT_MAX_AGE_SEC,
  CONSENT_STORAGE_KEY,
  consentReturnPath,
  isCookieConsentChoice,
  makeConsent,
  serializeConsentCookie,
} from '@/lib/cookie-consent';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const choice = form?.get('choice');
  const next = consentReturnPath(form?.get('next') || req.headers.get('referer'));
  const res = NextResponse.redirect(new URL(next, req.url), 303);

  if (isCookieConsentChoice(choice)) {
    res.cookies.set({
      name: CONSENT_STORAGE_KEY,
      value: serializeConsentCookie(makeConsent(choice)),
      path: '/',
      maxAge: CONSENT_MAX_AGE_SEC,
      sameSite: 'lax',
      httpOnly: false,
      secure: false,
    });
  }

  return res;
}
