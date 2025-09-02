const DEFAULT_WEBHOOK =
  'https://hook.us2.make.com/6wpuu9mtglv89lsj6acwd8tvbgrfbnko';
const RETRY_INTERVAL_MS = 500;

/** Resolve webhook URL */
function resolveWebhook() {
  return (
    window.SFR_WEBHOOK_URL ||
    document.querySelector('meta[name="sfr:webhook"]')?.content?.trim() ||
    DEFAULT_WEBHOOK
  );
}

/** Extract email from a string */
function extractEmail(text) {
  if (!text) return null;
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

/** Find user email in current document (safe, no window.top) */
function findUserEmail(root = document) {
  if (!root) return null;
  const spans = root.querySelectorAll(
    'span[slot="description"], span.description'
  );
  for (const span of spans) {
    const email = extractEmail(span.textContent?.trim() || '');
    if (email) return email;
  }
  return null;
}

/** Resolve submitter email */
function resolveSubmitter() {
  return new Promise((resolve) => {
    const tryFind = () => {
      const email = findUserEmail();
      if (email) resolve(email);
      else setTimeout(tryFind, RETRY_INTERVAL_MS);
    };
    tryFind();
  });
}

/** Collect authored page context safely */
function getContext() {
  const referrer = document.referrer || window.location.href;
  let urlObj;

  try {
    urlObj = new URL(referrer);
  } catch (e) {
    console.warn('Invalid referrer, falling back to window.location', e);
    urlObj = new URL(window.location.href);
  }

  const host = urlObj.host || '';
  const path = urlObj.pathname.replace(/^\/+/, '');
  const title = urlObj.pathname || 'Untitled Page';

  let ref = '', site = '', org = '';
  const match = host.match(/^([^-]+)--([^-]+)--([^.]+)\.aem\.(page|live)$/);
  if (match) [, ref, site, org] = match;

  const env = host.includes('.aem.live') ? 'live' : 'page';

  return {
    ref,
    site,
    org,
    env,
    path,
    title,
    host,
    isoNow: new Date().toISOString(),
    referrer: urlObj.href,
  };
}

/** Build payload for webhook */
async function buildPayload(ctx) {
  const { ref, site, org, host, path, isoNow, title, env, referrer } = ctx;

  const name =
    (path.split('/').filter(Boolean).pop() || 'index')
      .replace(/\.[^.]+$/, '') || 'index';

  const submittedBy = await resolveSubmitter();

  const liveHost =
    ref && site && org
      ? `${ref}--${site}--${org}.aem.live`
      : host.endsWith('.aem.page')
      ? host.replace('.aem.page', '.aem.live')
      : host || 'localhost';

  const previewHost =
    ref && site && org ? `${ref}--${site}--${org}.aem.page` : host || 'localhost';

  return {
    title,
    url: referrer, // exact authored page URL
    name,
    publishedDate: isoNow,
    submittedBy,
    path: `/${path}`,
    previewUrl: `https://${previewHost}/${path}`,
    liveUrl: `https://${liveHost}/${path}`,
    host,
    env,
    org,
    site,
    ref,
    source: 'DA.live',
    lang: document.documentElement?.lang || undefined,
    locale: navigator.language || undefined,
    headings: [], // cannot grab parent headings due to CORS
    analytics: {
      userAgent: navigator.userAgent,
      timezoneOffset: new Date().getTimezoneOffset(),
      viewport: {
        width: window.innerWidth || 0,
        height: window.innerHeight || 0,
      },
    },
  };
}

/** Post payload to webhook */
async function postToWebhook(payload) {
  const res = await fetch(resolveWebhook(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    mode: 'cors',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/** Render review card */
function renderCard({ status, message, payload }) {
  const details = document.getElementById('details');
  const statusMap = { success: 'success', error: 'error' };
  const statusClass = statusMap[status] || 'loading';

  const content =
    status === 'success' && payload
      ? `
        <p class="status-message ${statusClass}">${message}</p>
        <p><strong>Page Title:</strong> ${payload.title}</p>
        <p><strong>Page Name:</strong> ${payload.name}</p>
        <p><strong>Submitter Email:</strong> ${payload.submittedBy}</p>
        <p><strong>Page Preview URL:</strong>
          <a href="${payload.previewUrl}" target="_blank" rel="noopener noreferrer">
            ${payload.previewUrl}
          </a>
        </p>
      `
      : `<p class="status-message ${statusClass}">${message}</p>`;

  details.innerHTML = `
    <div id="review-card">
      <div class="header-bar">
        <img src="./assets/agilent-logo.png" alt="Agilent Logo" class="logo" />
      </div>
      <div class="content">${content}</div>
    </div>
  `;
}

/** Init flow */
document.addEventListener('DOMContentLoaded', async () => {
  renderCard({ status: 'loading', message: 'Submitting review request…' });
  try {
    const ctx = getContext();
    console.log('Context:', ctx);

    const payload = await buildPayload(ctx);
    console.log('Payload:', payload);

    const res = await postToWebhook(payload);
    console.log('Webhook response:', res);

    renderCard({
      status: 'success',
      message: 'Review request submitted to Workfront.',
      payload,
    });
  } catch (err) {
    console.error('Error submitting review:', err);
    renderCard({
      status: 'error',
      message: `Request Failed: ${err.message}`,
    });
  }
});
