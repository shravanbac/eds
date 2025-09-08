const DEFAULT_WEBHOOK = 'https://hook.us2.make.com/6wpuu9mtglv89lsj6acwd8tvbgrfbnko';
const RETRY_INTERVAL_MS = 500;

/** Resolve webhook URL */
function resolveWebhook() {
  return (
    window.SFR_WEBHOOK_URL
    || document.querySelector('meta[name="sfr:webhook"]')?.content?.trim()
    || DEFAULT_WEBHOOK
  );
}

/** Extract email from a string */
function extractEmail(text) {
  if (!text) return null;
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

/** Recursively find user email from Sidekick */
function findUserEmail(root = window.parent?.document || document) {
  if (!root) return null;

  const spans = root.querySelectorAll(
    'span[slot="description"], span.description',
  );
  let foundEmail = null;

  Array.from(spans).some((span) => {
    const email = extractEmail(span.textContent?.trim() || '');
    if (email) {
      foundEmail = email;
      return true;
    }
    return false;
  });

  if (foundEmail) return foundEmail;

  const elements = root.querySelectorAll('*');
  Array.from(elements).some((el) => {
    if (el.shadowRoot) {
      const email = findUserEmail(el.shadowRoot);
      if (email) {
        foundEmail = email;
        return true;
      }
    }
    return false;
  });

  return foundEmail;
}

/** Resolve submitter */
function resolveSubmitter(maxAttempts = 20) {
  return new Promise((resolve) => {
    let attempts = 0;
    const tryFind = () => {
      const email = findUserEmail();
      if (email) {
        resolve(email);
      } else {
        attempts += 1;
        if (attempts >= maxAttempts) {
          resolve('anonymous');
        } else {
          setTimeout(tryFind, RETRY_INTERVAL_MS);
        }
      }
    };
    tryFind();
  });
}

/** Collect authored page context */
function getContext() {
  const refUrl = document.referrer ? new URL(document.referrer) : null;
  const host = refUrl?.host || '';
  const path = refUrl?.pathname || window.location.pathname || '';

  let ref = '';
  let site = '';
  let org = '';
  const match = host.match(/^([^-]+)--([^-]+)--([^.]+)\.aem\.(page|live)$/);
  if (match) [, ref, site, org] = match;

  const env = host.includes('.aem.live') ? 'live' : 'page';

  return {
    ref,
    site,
    org,
    env,
    path,
    host,
    isoNow: new Date().toISOString(),
    refUrl,
  };
}

/** Build full payload */
async function buildPayload(ctx) {
  const {
    ref, site, org, host, isoNow, env, refUrl,
  } = ctx;

  // Always prefer referrer path, fallback to iframe path
  const refPath = refUrl?.pathname || window.location.pathname || '';
  const cleanPath = refPath.replace(/^\/+/, '');
  const name = (cleanPath.split('/').filter(Boolean).pop() || 'index')
    .replace(/\.[^.]+$/, '') || 'index';
  const submittedBy = await resolveSubmitter();

  let liveHost = host;
  let previewHost = host;
  if (ref && site && org) {
    liveHost = `${ref}--${site}--${org}.aem.live`;
    previewHost = `${ref}--${site}--${org}.aem.page`;
  } else if (host?.endsWith('.aem.page')) {
    liveHost = host.replace('.aem.page', '.aem.live');
  }

  const topDoc = window.top?.document;

  const pageTitle = topDoc?.title
    || topDoc?.querySelector('meta[property="og:title"]')?.content
    || topDoc?.querySelector('meta[name="title"]')?.content
    || document.title
    || '';

  const headings = Array.from(topDoc?.querySelectorAll('h1, h2, h3') || []).map(
    (h) => ({
      level: h.tagName,
      text: h.textContent?.trim() || '',
    }),
  );

  const metaDescription = topDoc?.querySelector('meta[name="description"]')?.content || '';

  const viewport = {
    width:
      window.top === window
        ? window.innerWidth
        : (window.top?.innerWidth || window.innerWidth),
    height:
      window.top === window
        ? window.innerHeight
        : (window.top?.innerHeight || window.innerHeight),
  };

  return {
    title: pageTitle,
    url: `https://${liveHost}/${cleanPath}`,
    name,
    publishedDate: isoNow,
    submittedBy,
    path: cleanPath ? `/${cleanPath}` : '/',
    previewUrl: `https://${previewHost}/${cleanPath}`,
    liveUrl: `https://${liveHost}/${cleanPath}`,
    host,
    env,
    org,
    site,
    ref,
    source: 'DA.live',
    lang: topDoc?.documentElement?.lang || undefined,
    locale: navigator.language || undefined,
    metaDescription,
    headings,
    analytics: {
      userAgent: navigator.userAgent,
      timezoneOffset: new Date().getTimezoneOffset(),
      viewport,
    },
  };
}

/** Post payload */
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

  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);

  try {
    return JSON.parse(text);
  } catch (err) {
    /* eslint-disable-next-line no-console */
    console.warn('Response not JSON:', text);
    return {};
  }
}

/** Render review card */
function renderCard({ status, message, payload }) {
  const details = document.getElementById('details');
  if (!details) return;

  const statusMap = {
    success: 'success',
    error: 'error',
  };
  const statusClass = statusMap[status] || 'loading';

  const content = status === 'success' && payload
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

/** Init */
document.addEventListener('DOMContentLoaded', async () => {
  renderCard({ status: 'loading', message: 'Submitting review request…' });

  try {
    const ctx = getContext();
    const payload = await buildPayload(ctx);
    await postToWebhook(payload);

    renderCard({
      status: 'success',
      message: 'Review request submitted to Workfront.',
      payload,
    });
  } catch (err) {
    renderCard({
      status: 'error',
      message: `Request Failed: ${err.message}`,
    });
  }
});
