const DEFAULT_WEBHOOK = 'https://hook.fusion.adobe.com/3o5lrlkstfbbrspi35hh0y3cmjkk4gdd';

function getPageInfo() {
  const sk = window.hlx?.sidekick?.config || {};
  console.log('DEBUG Sidekick config:', sk);
  console.log('DEBUG document.referrer:', document.referrer);

  let url = '';

  // 1. Use Sidekick referrer if available
  if (sk.referrer) {
    url = sk.referrer;
  } else if (document.referrer) {
    // 2. Fallback to browser referrer
    url = document.referrer;
  } else if (sk.host && sk.ref && sk.repo && sk.owner) {
    // 3. Try constructing from Sidekick repo info
    url = `https://${sk.ref}--${sk.repo}--${sk.owner}.${sk.host}/`;
  }

  // Default if nothing found
  if (!url) {
    url = 'https://localhost/';
  }

  // Derive page name
  let pageName = 'index';
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+/, '');
    if (path) {
      pageName = (path.split('/').filter(Boolean).pop() || 'index')
        .replace(/\.[^.]+$/, '') || 'index';
    }
  } catch (e) {
    console.warn('Page name extraction failed', e);
  }

  return {
    pageUrl: url,
    pageName,
  };
}

/** Post payload */
async function postToWebhook(payload) {
  const res = await fetch(DEFAULT_WEBHOOK, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    mode: 'cors',
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json().catch(() => ({}));
}

/** Render status in panel */
function render(message, status = 'info') {
  const details = document.getElementById('details');
  details.innerHTML = `
    <div id="review-card">
      <p class="${status}">${message}</p>
    </div>
  `;
}

/** Init */
document.addEventListener('DOMContentLoaded', async () => {
  render('Submitting review request…', 'loading');

  try {
    const { pageUrl, pageName } = getPageInfo();
    const payload = { pageUrl, pageName };

    console.log('DEBUG payload to webhook:', payload);

    await postToWebhook(payload);

    render(`Review request submitted. Page: ${pageName} (${pageUrl})`, 'success');
  } catch (err) {
    render(`Request Failed: ${err.message}`, 'error');
  }
});
