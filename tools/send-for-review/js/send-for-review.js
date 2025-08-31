/* eslint-disable no-console */
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
  const match = text.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
  );
  return match ? match[0] : null;
}

/** Recursively find user email from Sidekick shadowRoots */
function findUserEmail(root = window.parent?.document || document) {
  if (!root) return null;

  // Look for spans with slot="description" or class="description"
  const spans = root.querySelectorAll(
    'span[slot="description"], span.description'
  );
  for (const span of spans) {
    const email = extractEmail(span.textContent?.trim() || '');
    if (email) return email;
  }

  // Search deeper inside shadowRoots
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) {
      const found = findUserEmail(el.shadowRoot);
      if (found) return found;
    }
  }

  return null;
}

/** Resolve submitter */
async function resolveSubmitter() {
  return new Promise((resolve) => {
    const tryFind = () => {
      const email = findUserEmail();
      if (email) {
        resolve(email);
      } else {
        setTimeout(tryFind, RETRY_INTERVAL_MS);
      }
    };
    tryFind();
  });
}

/** Collect authored page context */
function getContext() {
  const host = window.top?.location?.host || '';
  const path = window.top?.location?.pathname || '';
  const url = window.top?.location?.href || '';
  const title = window.top?.document?.title || '';

  let ref = '';
  let site = '';
  let org = '';
  const match = host.match(
    /^([^-]+)--([^-]+)--([^.]+)\.aem\.(page|live)$/
  );
  if (match) [, ref, site, org] = match;

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
  const { ref, site, org, host, path, isoNow, title, env } = ctx;
  const cleanPath = path.replace(/^\/+/, '');
  const name =
    (cleanPath.split('/').filter(Boolean).pop() || 'index').replace(
      /\.[^.]+$/,
      ''
    ) || 'index';

  const submittedBy = await resolveSubmitter();

  const liveHost =
    ref && site && org
      ? `${ref}--${site}--${org}.aem.live`
      : host?.endsWith('.aem.page')
      ? host.replace('.aem.page', '.aem.live')
      : host || 'localhost';

  const previewHost =
    ref && site && org
      ? `${ref}--${site}--${org}.aem.page`
      : host || 'localhost';

  const topDoc = window.top?.document;

  // Collect headings
  const headings = Array.from(
    topDoc?.querySelectorAll('h1, h2, h3') || []
  ).map((h) => ({
    level: h.tagName,
    text: h.textContent?.trim() || '',
  }));

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
    lang: topDoc?.documentElement?.lang || undefined,
    locale: navigator.language || undefined,
    headings,
    analytics: {
      userAgent: navigator.userAgent,
      timezoneOffset: new Date().getTimezoneOffset(),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    },
  };
}

/** Post payload to webhook */
async function postToWebhook(payload) {
  const response = await fetch(resolveWebhook(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    mode: 'cors',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  try {
    return await response.json();
  } catch {
    return {};
  }
}

/** Auto-send when palette loads */
document.addEventListener('DOMContentLoaded', async () => {
  const status = document.getElementById('status');
  const details = document.getElementById('details');

  try {
    const ctx = getContext();
    const payload = await buildPayload(ctx);

    await postToWebhook(payload);

    status.textContent = `Review request submitted to workfront.`;
    details.innerHTML = `
  <div id="review-card">
    <div class="header-bar">
      <img src="./assets/agilent-logo.png" alt="Agilent Logo" class="logo" />
      <span class="header-text">Review Summary</span>
    </div>
    <div class="content">
      <p><strong>Page Title:</strong> ${payload.title}</p>
      <p><strong>Page Name:</strong> ${payload.name}</p>
      <p><strong>Reviewer Email:</strong> ${payload.submittedBy}</p>
      <p><strong>Page Preview URL:</strong> 
        <a href="${payload.previewUrl}" target="_blank" rel="noopener noreferrer">
          ${payload.previewUrl}
        </a>
      </p>
    </div>
  </div>
`;


  } catch (err) {
    if (status) {
      status.textContent = `Request Failed: ${err.message}`;
    }
    console.error(err);
  }
});
