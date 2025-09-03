const DEFAULT_WEBHOOK = 'https://hook.fusion.adobe.com/3o5lrlkstfbbrspi35hh0y3cmjkk4gdd';

function getPageInfo() {
  let url = '';

  // 1. First, check query string param (Helix usually passes referrer in ?referrer=…)
  const params = new URLSearchParams(window.location.search);
  if (params.get('referrer')) {
    url = params.get('referrer');
  }

  // 2. Otherwise, fallback to document.referrer
  if (!url && document.referrer) {
    url = document.referrer;
  }

  let pageName = 'index';
  try {
    if (url) {
      const u = new URL(url);
      const path = u.pathname.replace(/^\/+/, '');
      if (path) {
        pageName = (path.split('/').filter(Boolean).pop() || 'index')
          .replace(/\.[^.]+$/, '') || 'index';
      }
    }
  } catch (e) {
    console.warn('Page name extraction failed', e);
  }

  return { pageUrl: url, pageName };
}

async function postToWebhook(payload) {
  const res = await fetch(DEFAULT_WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    mode: 'cors',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(() => ({}));
}

function render(message, status = 'info') {
  const details = document.getElementById('details');
  details.innerHTML = `<p class="${status}">${message}</p>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  render('Submitting review request…', 'loading');

  try {
    const { pageUrl, pageName } = getPageInfo();
    const payload = { pageUrl, pageName };

    console.log('DEBUG payload to webhook:', payload);
    await postToWebhook(payload);

    render(
      `Review request submitted. Page: ${pageName} (${pageUrl})`,
      'success',
    );
  } catch (err) {
    render(`Request Failed: ${err.message}`, 'error');
  }
});
