const DEFAULT_WEBHOOK = 'https://hook.app.workfrontfusion.com/3o5lrlkstfbbrspi35hh0y3cmjkk4gdd';

/** Resolve webhook URL */
function resolveWebhook() {
  return (
    window.SFR_WEBHOOK_URL ||
    document.querySelector('meta[name="sfr:webhook"]')?.content?.trim() ||
    DEFAULT_WEBHOOK
  );
}

/** Parse sidekick config from ?config=... or window.name */
function getSidekickConfig() {
  // First, try ?config=...
  const params = new URLSearchParams(window.location.search);
  if (params.has('config')) {
    try {
      return JSON.parse(decodeURIComponent(params.get('config')));
    } catch (e) {
      console.error('Failed to parse config from query param:', e);
    }
  }

  // Fallback: try window.name
  try {
    if (window.name && window.name.startsWith('{')) {
      return JSON.parse(window.name);
    }
  } catch (e) {
    console.error('Failed to parse config from window.name:', e);
  }

  return {};
}

/** Collect context */
function getContext() {
  const sk = getSidekickConfig();

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
    path: path.replace(/^\//, ''),
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
  const name = (cleanPath.split('/').filter(Boolean).pop() || 'index')
    .replace(/\.[^.]+$/, '') || 'index';

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

  const ctx = getContext();
  console.log('Decoded sidekick config:', getSidekickConfig());
  console.log('Context used for payload:', ctx);

  try {
    const payload = buildPayload(ctx);
    console.log('Payload to webhook:', payload);

    await postToWebhook(payload);

    status.textContent = '✅ Review request submitted.';
    details.innerHTML = `
      <p><strong>Title:</strong> ${payload.title}</p>
      <p><strong>Preview URL:</strong> <a href="${payload.previewUrl}" target="_blank">${payload.previewUrl}</a></p>
      <p><strong>Live URL:</strong> <a href="${payload.liveUrl}" target="_blank">${payload.liveUrl}</a></p>
      <p><strong>Submitted By:</strong> ${payload.submittedBy}</p>
    `;
  } catch (err) {
    status.textContent = `❌ Failed: ${err.message}`;
  }
});
