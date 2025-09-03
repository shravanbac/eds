const DEFAULT_WEBHOOK = 'https://hook.fusion.adobe.com/3o5lrlkstfbbrspi35hh0y3cmjkk4gdd';

/** Derive page name from referrer URL */
function getPageName() {
  const refUrl = document.referrer ? new URL(document.referrer) : null;
  const path = refUrl?.pathname || '';
  const cleanPath = path.replace(/^\/+/, '');
  return (cleanPath.split('/').filter(Boolean).pop() || 'index')
    .replace(/\.[^.]+$/, '') || 'index';
}

/** Build payload with only page name */
function buildPayload() {
  return {
    pageName: getPageName(),
  };
}

/** Post payload to webhook */
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

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json().catch(() => ({}));
}

/** Render status in panel */
function render(message, status = 'info') {
  const details = document.getElementById('details');
  details.innerHTML = `
    <div id="review-card">
      <div class="header-bar">
        <strong>Status:</strong> <span class="${status}">${message}</span>
      </div>
    </div>
  `;
}

/** Init */
document.addEventListener('DOMContentLoaded', async () => {
  render('Submitting review request…', 'loading');

  try {
    const payload = buildPayload();
    await postToWebhook(payload);
    render(`Review request submitted. Page Name: ${payload.pageName}`, 'success');
  } catch (err) {
    render(`Request Failed: ${err.message}`, 'error');
  }
});
