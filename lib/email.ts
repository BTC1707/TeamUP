import { runtime } from '@/lib/server';

export class EmailError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export function emailConfigured() {
  const { RESEND_API_KEY, EMAIL_FROM } = runtime();
  return !!(RESEND_API_KEY && EMAIL_FROM);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const { RESEND_API_KEY, EMAIL_FROM } = runtime();
  if (!RESEND_API_KEY || !EMAIL_FROM)
    throw new EmailError(
      'Email delivery is not configured yet. Ask the site owner to connect Resend.',
      503,
    );

  const to = opts.to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 254)
    throw new EmailError('Enter a valid email address.', 400);

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject: opts.subject.slice(0, 200),
        text: opts.text,
        ...(opts.html ? { html: opts.html } : {}),
      }),
    });
  } catch {
    throw new EmailError('Email could not be sent in time. Please try again.', 504);
  }

  if (response.ok) return { ok: true as const };

  if (response.status === 429)
    throw new EmailError(
      'The email quota for today has been reached. Try again tomorrow or upgrade the Resend plan.',
      429,
    );
  if ([401, 403].includes(response.status))
    throw new EmailError(
      'Resend rejected this request. Check that RESEND_API_KEY and EMAIL_FROM are valid.',
      503,
    );

  console.error('Resend request failed', { status: response.status });
  throw new EmailError('Email could not be sent. Please try again.');
}

export function inviteEmailContent(opts: {
  inviterName: string;
  projectName: string;
  joinUrl: string;
  expiresAt: number;
}) {
  const when = new Date(opts.expiresAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const subject = `${opts.inviterName} invited you to ${opts.projectName}`;
  const text = [
    `${opts.inviterName} invited you to join “${opts.projectName}” on TeamUP.`,
    '',
    `Open this link to join (sign in with this email):`,
    opts.joinUrl,
    '',
    `This invitation expires ${when}.`,
    '',
    'If you were not expecting this, you can ignore this email.',
  ].join('\n');
  const html = `
    <p><strong>${escapeHtml(opts.inviterName)}</strong> invited you to join
    “<strong>${escapeHtml(opts.projectName)}</strong>” on TeamUP.</p>
    <p><a href="${escapeAttr(opts.joinUrl)}">Accept the invitation</a></p>
    <p style="color:#5c6370;font-size:13px">Or paste this link into your browser:<br/>
    ${escapeHtml(opts.joinUrl)}</p>
    <p style="color:#5c6370;font-size:13px">This invitation expires ${escapeHtml(when)}.</p>
  `.trim();
  return { subject, text, html };
}

export function nudgeEmailContent(opts: {
  senderName: string;
  projectName: string;
  workspaceUrl: string;
}) {
  const subject = `${opts.senderName} nudged you on TeamUP`;
  const lead = `${opts.senderName} sent you a nudge on your ${opts.projectName} project. Go in and get your work done!`;
  const text = [lead, '', 'Open the project:', opts.workspaceUrl].join('\n');
  const html = `
    <p>${escapeHtml(lead)}</p>
    <p><a href="${escapeAttr(opts.workspaceUrl)}">Open the project</a></p>
  `.trim();
  return { subject, text, html };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
