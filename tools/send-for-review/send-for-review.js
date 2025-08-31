const DEFAULT_WEBHOOK = 'https://hook.app.workfrontfusion.com/3o5lrlkstfbbrspi35hh0y3cmjkk4gdd';

/** Resolve webhook URL */
function resolveWebhook() {
  return (
    window.SFR_WEBHOOK_URL ||
    document.querySelector('meta[name="sfr:webhook"]')?.content?.trim() ||
    DEFAULT_WEBHOOK
  );
}

/** Try to get submitter email from Sidekick */
function getSubmitterFromSidekick() {
  try {
    const sk = document.querySelector('aem-sidekick, helix-sidekick');
    const root = sk?.shadowRoot;
    if (!root) return null;

    const userNode = root.querySelector('sk-menu-item.user span[slot="description"]');
    return userNode?.textContent?.trim() || null;
  } catch (e) {
    console.warn('Could not read submitter from Sidekick', e);
    return null;
  }
}

/** Resolve submitter identity */
async function resolveSubmitter() {
  if (window.SFR_USER) return window.SFR_USER;

  const metaUser = document.querySelector('meta[name="sfr:user"]')?.content;
  if (metaUser) return metaUser;

  const skUser = getSubmitterFromSidekick();
  if (skUser) return skUser;

  return 'anonymous';
}

/** Collect authored page context */
function getContext() {
  let host = window.top?.location?.host || '';
  let path = window.top?.location?.pathname || '';
  let url = window.top?.location?.href || '';
  let title = window.top?.document?.title || '';

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
async function buildPayload(ctx) {
  const { ref, site, org, host, path, isoNow, title } = ctx;
  const cleanPath = path.replace(/^\/+/, '');
  const name = (cleanPath.split('/').filter(Boolean).pop() || 'index')
    .replace(/\.[^.]+$/, '') || 'index';

  const submittedBy = await resolveSubmitter();

  const liveHost = ref && site && org
    ? `${ref}--${site}--${org}.aem.live`
    : host?.endsWith('.aem.page')
      ? host.replace('.aem.page', '.aem.live')
      : host || 'localhost';

  const previewHost = ref && site && org
    ? `${ref}--${site}--${org}.aem.page`
    : host || 'localhost';

  // Meta description with fallback
  let metaDescription =
    window.top.document.querySelector('meta[name="description"]')?.content?.trim() || null;
  if (!metaDescription) {
    const firstPara = window.top.document.querySelector('p');
    if (firstPara) {
      metaDescription = firstPara.textContent.trim();
    }
  }

  // Collect headings
  const headings = Array.from(window.top.document.querySelectorAll('h1, h2, h3'))
    .slice(0, 6)
    .map(h => ({ level: h.tagName, text: h.textContent.trim() }));

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

    lang: window.top.document.documentElement.lang || undefined,
    locale: navigator.language || undefined,
    timezoneOffset: new Date().getTimezoneOffset(),
    userAgent: navigator.userAgent || undefined,
    viewport: { width: window.innerWidth, height: window.innerHeight },

    meta: {
      description: metaDescription,
      keywords: window.top.document.querySelector('meta[name="keywords"]')?.content || null,
      author: window.top.document.querySelector('meta[name="author"]')?.content || null,
    },

    headings,
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
    const payload = await buildPayload(ctx);

    await postToWebhook(payload);

    status.textContent = `✅ Review request submitted by ${payload.submittedBy}.`;
    details.innerHTML = `
      <p><strong>Title:</strong> ${payload.title}</p>
      <p><strong>Preview URL:</strong> <a href="${payload.previewUrl}" target="_blank">${payload.previewUrl}</a></p>
      <p><strong>Live URL:</strong> <a href="${payload.liveUrl}" target="_blank">${payload.liveUrl}</a></p>
      <p><strong>Submitted By:</strong> ${payload.submittedBy}</p>
      <p><strong>Ref / Site / Org:</strong> ${payload.ref} / ${payload.site} / ${payload.org}</p>
      <p><strong>Language:</strong> ${payload.lang}</p>
      <p><strong>Locale:</strong> ${payload.locale}</p>
      <p><strong>Timezone Offset:</strong> ${payload.timezoneOffset}</p>
      <p><strong>User Agent:</strong> ${payload.userAgent}</p>
      <p><strong>Meta Description:</strong> ${payload.meta.description || 'N/A'}</p>
      <p><strong>Viewport:</strong> ${payload.viewport.width} x ${payload.viewport.height}</p>
      <p><strong>Headings:</strong></p>
      <ul>
        ${payload.headings.map(h => `<li>${h.level}: ${h.text}</li>`).join('')}
      </ul>
    `;
  } catch (err) {
    status.textContent = `❌ Failed: ${err.message}`;
  }
});
