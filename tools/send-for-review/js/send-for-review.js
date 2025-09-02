const DEFAULT_WEBHOOK = 'https://hook.us2.make.com/6wpuu9mtglv89lsj6acwd8tvbgrfbnko';
const RETRY_INTERVAL_MS = 500;

/** Resolve webhook URL */
function resolveWebhook() {
  return (
    window.SFR_WEBHOOK_URL || document.querySelector('meta[name="sfr:webhook"]')?.content?.trim() || DEFAULT_WEBHOOK
  );
}

/** Extract email from a string */
function extractEmail(text) {
  if (!text) return null;
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

/** Recursively find user email from Sidekick shadowRoots */
function findUserEmail(root = window.parent?.document || document) {
  if (!root) return null;

  // check description spans
  const spans = root.querySelectorAll('span[slot="description"], span.description');
  let foundEmail = null;

  Array.from(spans).some((span) => {
    const email = extractEmail(span.textContent?.trim() || '');
    if (email) {
      foundEmail = email;
      return true; // stop iteration
    }
    return false;
  });

  if (foundEmail) return foundEmail;

  // recurse into shadowRoots
  const elements = root.querySelectorAll('*');
  Array.from(elements).some((el) => {
    if (el.shadowRoot) {
      const email = findUserEmail(el.shadowRoot);
      if (email) {
        foundEmail = email;
        return true; // stop iteration
      }
    }
    return false;
  });

  return foundEmail;
}

/** Resolve submitter */
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

/** Collect authored page context (safe, no window.top) */
function getContext() {
  const host = window.location.host || '';
  const path = window.location.pathname || '';
  const title = document.title || '';

  let ref = '';
  let site = '';
  let org = '';

  // Match DA.live host pattern: ref--site--org.aem.page/live
  const match = host.match(/^([^-]+)--([^-]+)--([^.]+)\.aem\.(page|live)$/);
  if (match) {
    [, ref, site, org] = match;
  }

  const env = host.includes('.aem.live') ? 'live' : 'page';

  return {
    ref,
    site,
    org,
    env,
    path: path.replace(/^\//, ''),
    title,
    host,
    isoNow: new Date().toISOString(),
  };
}

/** Build full payload (safe for cross-origin) */
async function buildPayload(ctx) {
  const
    {
      ref, site, org, host, path, isoNow, title, env,
    } = ctx;

  const cleanPath = path.replace(/^\/+/, '');
  const name = (cleanPath.split('/').filter(Boolean).pop() || 'index').replace(/\.[^.]+$/, '') || 'index';
  const submittedBy = await resolveSubmitter();

  // Build liveHost and previewHost
  let liveHost;
  if (ref && site && org) {
    liveHost = `${ref}--${site}--${org}.aem.live`;
  } else if (host?.endsWith('.aem.page')) {
    liveHost = host.replace('.aem.page', '.aem.live');
  } else {
    liveHost = host || 'localhost';
  }

  let previewHost;
  if (ref && site && org) {
    previewHost = `${ref}--${site}--${org}.aem.page`;
  } else {
    previewHost = host || 'localhost';
  }

  // Local document info (safe)
  const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((h) => ({
    level: h.tagName,
    text: h.textContent?.trim() || '',
  }));

  const viewport = {
    width: window.innerWidth || 0,
    height: window.innerHeight || 0,
  };

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
    env,
    org,
    site,
    ref,
    source: 'DA.live',
    lang: document.documentElement?.lang || undefined,
    locale: navigator.language || undefined,
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
