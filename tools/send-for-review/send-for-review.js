const DEFAULT_WEBHOOK = 'https://hook.app.workfrontfusion.com/3o5lrlkstfbbrspi35hh0y3cmjkk4gdd';

/** Resolve webhook URL */
function resolveWebhook() {
  return (
    window.SFR_WEBHOOK_URL ||
    document.querySelector('meta[name="sfr:webhook"]')?.content?.trim() ||
    DEFAULT_WEBHOOK
  );
}

/** Extract logged-in user email from Sidekick shadow DOM */
function getSubmitterFromSidekick() {
  try {
    const sk = document.querySelector('aem-sidekick, helix-sidekick');
    const pluginRoot = sk?.shadowRoot?.querySelector('plugin-action-bar')?.shadowRoot;
    const actionBar = pluginRoot?.querySelector('action-bar')?.shadowRoot;

    const userNode = actionBar?.querySelector('sk-menu-item.user span[slot="description"]');
    if (userNode) {
      return userNode.textContent.trim();
    }
  } catch (e) {
    console.warn('Could not extract submitter from Sidekick', e);
  }
  return null;
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
async function buildPayload(ctx) {
  const { ref, site, org, host, path, isoNow, title } = ctx;
  const cleanPath = path.replace(/^\/+/, '');
  const name = (cleanPath.split('/').filter(Boolean).pop() || 'index')
    .replace(/\.[^.]+$/, '') || 'index';

  const submittedBy = getSubmitterFromSidekick() || 'anonymous';

  const liveHost = ref && site && org
    ? `${ref}--${site}--${org}.aem.live`
    : host?.endsWith('.aem.page')
      ? host.replace('.aem.page', '.aem.live')
      : host || 'localhost';

  const previewHost = ref && site && org
    ? `${ref}--${site}--${org}.aem.page`
    : host || 'localhost';

  // meta description with fallback
  let metaDescription =
    window.top.document.querySelector('meta[name="description"]')?.content?.trim() || null;
  if (!metaDescription) {
    const firstPara = window.top.document.querySelector('p');
    if (firstPara) metaDescription = firstPara.textContent.trim();
  }

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

    lang: document.documentElement.lang || undefined,
    locale: navigator.language || undefined,
    timezoneOffset: new Date().getTimezoneOffset(),
    userAgent: navigator.userAgent,

    meta: {
      description: metaDescription,
      keywords: window.top.document.querySelector('meta[name="keywords"]')?.content || null,
      author: window.top.document.querySelector('meta[name="author"]')?.content || null,
    },

    headings: Array.from(window.top.document.querySelectorAll('h1, h2, h3'))
      .slice(0, 6)
      .map((h) => ({ level: h.tagName, text: h.textContent.trim() })),

    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
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
    `;
  } catch (err) {
    status.textContent = `❌ Failed: ${err.message}`;
  }
});
