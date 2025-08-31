const DEFAULT_WEBHOOK = 'https://hook.us2.make.com/6wpuu9mtglv89lsj6acwd8tvbgrfbnko';

/** Resolve webhook URL */
function resolveWebhook() {
  return (
    window.SFR_WEBHOOK_URL ||
    document.querySelector('meta[name="sfr:webhook"]')?.content?.trim() ||
    DEFAULT_WEBHOOK
  );
}

/** Recursively find the user email inside shadowRoots */
function deepFindUserEmail(root = document) {
  if (!root) return null;
  const nodes = root.querySelectorAll('sk-menu-item.user');
  for (const n of nodes) {
    const span = n.querySelector('span[slot="description"]');
    if (span) return span.textContent.trim();
  }
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) {
      const found = deepFindUserEmail(el.shadowRoot);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Recursively search all shadowRoots for <sk-menu-item class="user">
 * and return the email inside <span slot="description">.
 */
function getSidekickUserEmail(root = document) {
  if (!root) return null;

  // Look for the user node
  const userNode = root.querySelector('sk-menu-item.user span[slot="description"]');
  if (userNode) {
    return userNode.textContent.trim();
  }

  // If not found, go deeper into shadowRoots
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) {
      const found = getSidekickUserEmail(el.shadowRoot);
      if (found) return found;
    }
  }

  return null;
}


/** Resolve submitter identity */
async function resolveSubmitter() {
  // 1. Global overrides
  if (window.SFR_USER) return window.SFR_USER;
  const metaUser = document.querySelector('meta[name="sfr:user"]')?.content;
  if (metaUser) return metaUser;

  // 2. Try to read Sidekick DOM recursively
  const sk = document.querySelector('aem-sidekick, helix-sidekick');
  if (sk?.shadowRoot) {
    const email = getSidekickUserEmail(sk.shadowRoot);
    if (email) return email;
  }

  // 3. Fallback
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

  // Always use top document for authored content
  const topDoc = window.top?.document;

  // Meta description from page
  const qMeta = (sel) => topDoc?.querySelector(sel)?.content || null;
  const description =
    qMeta('meta[name="description"]') ||
    qMeta('meta[property="og:description"]') ||
    '';

  // Collect h1, h2, h3 from authored page
  const headings = Array.from(topDoc?.querySelectorAll('h1, h2, h3') || [])
    .map((h) => ({
      level: h.tagName,
      text: h.textContent.trim(),
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
    env: ctx.env,
    org,
    site,
    ref,
    source: 'DA.live',

    // extra details
    lang: topDoc?.documentElement.lang || undefined,
    locale: navigator.language || undefined,
    meta: { description },
    headings,
    analytics: {
      userAgent: navigator.userAgent,
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
