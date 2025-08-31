const DEFAULT_WEBHOOK = 'https://hook.app.workfrontfusion.com/3o5lrlkstfbbrspi35hh0y3cmjkk4gdd';

function resolveWebhook() {
  return (
    window.SFR_WEBHOOK_URL ||
    document.querySelector('meta[name="sfr:webhook"]')?.content?.trim() ||
    DEFAULT_WEBHOOK
  );
}

/** Collect context from sidekick config */
function getContext() {
  const sk = window.hlx?.sidekick?.config || {};

  const {
    host = '',
    ref = '',
    repo: site = '',
    owner: org = '',
    path = '',
    url = '',
    title = ''
  } = sk;

  const env = host.includes('.aem.live') ? 'live' : 'page';

  return {
    ref,
    site,
    org,
    env,
    path: path.replace(/^\//, ''), // authored page path
    title: title || document.title,
    url: url || window.location.href,
    host,
    isoNow: new Date().toISOString(),
  };
}

/** Build full payload */
function buildPayload(ctx) {
  const { ref, site, org, host, path, isoNow } = ctx;
  const cleanPath = path.replace(/^\/+/, '');
  const name = (cleanPath.split('/').filter(Boolean).pop() || 'index').replace(/\.[^.]+$/, '') || 'index';

  const submittedBy =
    window.SFR_USER ||
    document.querySelector('meta[name="sfr:user"]')?.content ||
    'anonymous';

  const liveHost = ref && site && org
    ? `${ref}--${site}--${org}.aem.live`
    : host?.endsWith('.aem.page')
      ? host.replace('.aem.page', '.aem.live')
      : host || 'localhost';

  const previewHost = ref && site && org
    ? `${ref}--${site}--${org}.aem.page`
    : host || 'localhost';

  const qMeta = (sel) => document.head.querySelector(sel)?.content || null;
  const metas = (prefix) => {
    const out = {};
    document.head.querySelectorAll(`meta[property^="${prefix}"], meta[name^="${prefix}"]`)
      .forEach((m) => {
        const key = (m.getAttribute('property') || m.getAttribute('name'))
          .replace(`${prefix}:`, '');
        out[key] = m.content;
      });
    return Object.keys(out).length ? out : undefined;
  };

  return {
    title: ctx.title,
    url: `https://${liveHost}/${cleanPath}`,
    name,
    publishedDate: isoNow,
    submittedBy,
    path: `/${cleanPath}`,
    previewUrl: `https://${previewHost}/${cleanPath}`,
    liveUrl: `https://${liveHost}/${cleanPath}`,
    host,
    env: ctx.env,
    org,
    site,
    ref,
    source: 'DA.live',
    lang: document.documentElement.lang || undefined,
    dir: document.documentElement.dir || undefined,
    canonical: document.querySelector('link[rel="canonical"]')?.href,
    meta: {
      description: qMeta('meta[name="description"]'),
      keywords: qMeta('meta[name="keywords"]'),
      author: qMeta('meta[name="author"]'),
      og: metas('og'),
    },
    headings: Array.from(document.querySelectorAll('h1, h2, h3'))
      .slice(0, 6)
      .map((h) => ({ level: h.tagName, text: h.textContent.trim() })),
    analytics: {
      referrer: document.referrer || undefined,
      userAgent: navigator.userAgent || undefined,
      locale: navigator.language || undefined,
      timezoneOffset: new Date().getTimezoneOffset(),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    },
    idempotencyKey: `${cleanPath}#${isoNow}`,
  };
}

/** Post payload */
async function postToWebhook(payload) {
  const res = await fetch(resolveWebhook(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    mode: 'cors',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json().catch(() => ({}));
}

/** UI binding */
document.addEventListener('DOMContentLoaded', () => {
  const sendBtn = document.getElementById('sendBtn');
  const status = document.getElementById('status');

  sendBtn.addEventListener('click', async () => {
    try {
      const payload = buildPayload(getContext());
      await postToWebhook(payload);
      status.textContent = '✅ Review request submitted.';
    } catch (err) {
      status.textContent = `❌ Failed: ${err.message}`;
    }
  });
});
