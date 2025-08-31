const DEFAULT_WEBHOOK = 'https://hook.app.workfrontfusion.com/3o5lrlkstfbbrspi35hh0y3cmjkk4gdd';

/** Resolve webhook URL */
function resolveWebhook() {
  return (
    window.SFR_WEBHOOK_URL ||
    document.querySelector('meta[name="sfr:webhook"]')?.content?.trim() ||
    DEFAULT_WEBHOOK
  );
}

/** Resolve submitter identity (simplified, defaults to anonymous) */
function resolveSubmitter() {
  return window.SFR_USER || 'anonymous';
}

/** Collect authored page context */
function getContext() {
  let host = window.top?.location?.host || '';
  let path = window.top?.location?.pathname || '';
  let url = window.top?.location?.href || '';
  let title = window.top?.document?.title || '';

  // Derive ref, site, org from host
  let ref = '', site = '', org = '';
  const m = host.match(/^([^-]+)--([^-]+)--([^.]+)\.aem\.(page|live)$/);
  if (m) [, ref, site, org] = m;

  const env = host.includes('.aem.live') ? 'live' : 'page';

  return {
    ref,
    site,
    org,
    env,
    path: path.replace(/^\//, ''),
    title,
    url,
    host,
    isoNow: new Date().toISOString(),
  };
}

/** Build full payload */
function buildPayload(ctx) {
  const { ref, site, org, host, path, isoNow, title } = ctx;
  const cleanPath = path.replace(/^\/+/, '');
  const name = (cleanPath.split('/').filter(Boolean).pop() || 'index')
    .replace(/\.[^.]+$/, '') || 'index';

  const submittedBy = resolveSubmitter();

  const liveHost = ref && site && org
    ? `${ref}--${site}--${org}.aem.live`
    : host?.endsWith('.aem.page')
      ? host.replace('.aem.page', '.aem.live')
      : host || 'localhost';

  const previewHost = ref && site && org
    ? `${ref}--${site}--${org}.aem.page`
    : host || 'localhost';

  // Extras
  const lang = window.top.document.documentElement.lang || undefined;
  const locale = navigator.language || undefined;
  const userAgent = navigator.userAgent || undefined;
  const timezoneOffset = new Date().getTimezoneOffset();

  const metaDescription = window.top.document.querySelector('meta[name="description"]')?.content || null;
  const metaKeywords = window.top.document.querySelector('meta[name="keywords"]')?.content || null;
  const metaAuthor = window.top.document.querySelector('meta[name="author"]')?.content || null;

  // Collect all OG tags into object
  const ogMeta = {};
  window.top.document.querySelectorAll('meta[property^="og:"]').forEach((m) => {
    const key = m.getAttribute('property').replace('og:', '');
    ogMeta[key] = m.content;
  });

  // ✅ Get h1, h2, h3 from authored page
  const h1 = window.top.document.querySelector('h1')?.textContent.trim() || '';
  const h2 = window.top.document.querySelector('h2')?.textContent.trim() || '';
  const h3 = window.top.document.querySelector('h3')?.textContent.trim() || '';

  const viewport = { width: window.innerWidth, height: window.innerHeight };

  return {
    title,
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

    // extras
    lang,
    locale,
    userAgent,
    timezoneOffset,
    meta: {
      description: metaDescription,
      keywords: metaKeywords,
      author: metaAuthor,
      og: Object.keys(ogMeta).length ? ogMeta : undefined,
    },
    heading1: h1,
    heading2: h2,
    heading3: h3,
    viewport,

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

/** Auto-send when palette loads */
document.addEventListener('DOMContentLoaded', async () => {
  const status = document.getElementById('status');
  const details = document.getElementById('details');

  try {
    const ctx = getContext();
    const payload = buildPayload(ctx);

    await postToWebhook(payload);

    status.textContent = `✅ Review request submitted by ${payload.submittedBy}.`;
    details.innerHTML = `
      <p><strong>Title:</strong> ${payload.title}</p>
      <p><strong>Preview URL:</strong> <a href="${payload.previewUrl}" target="_blank">${payload.previewUrl}</a></p>
      <p><strong>Live URL:</strong> <a href="${payload.liveUrl}" target="_blank">${payload.liveUrl}</a></p>
      <p><strong>Submitted By:</strong> ${payload.submittedBy}</p>
      <p><strong>Heading1:</strong> ${payload.heading1}</p>
      <p><strong>Heading2:</strong> ${payload.heading2}</p>
      <p><strong>Heading3:</strong> ${payload.heading3}</p>
      <p><strong>Lang / Locale:</strong> ${payload.lang} / ${payload.locale}</p>
      <p><strong>User Agent:</strong> ${payload.userAgent}</p>
      <p><strong>Timezone Offset:</strong> ${payload.timezoneOffset}</p>
      <p><strong>Meta Description:</strong> ${payload.meta.description}</p>
      <p><strong>Viewport:</strong> ${payload.viewport.width} x ${payload.viewport.height}</p>
      <p><strong>Ref / Site / Org:</strong> ${payload.ref} / ${payload.site} / ${payload.org}</p>
    `;
  } catch (err) {
    status.textContent = `❌ Failed: ${err.message}`;
  }
});
