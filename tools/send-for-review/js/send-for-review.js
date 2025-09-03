const DEFAULT_WEBHOOK = 'https://hook.fusion.adobe.com/3o5lrlkstfbbrspi35hh0y3cmjkk4gdd';

/** Inject listener into parent page (if not already there) */
function injectParentListener() {
  try {
    window.top.postMessage({ type: 'INJECT_LISTENER' }, '*');
  } catch (e) {
    console.warn('Unable to inject parent listener', e);
  }
}

/** Get page info using postMessage */
function getPageInfo() {
  return new Promise((resolve) => {
    // Step 1: ask parent for its URL
    window.top.postMessage({ type: 'GET_PAGE_URL' }, '*');

    function handleMessage(event) {
      if (event.data && event.data.type === 'PAGE_URL') {
        window.removeEventListener('message', handleMessage);

        const url = event.data.url || document.referrer || '';
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

        resolve({ pageUrl: url, pageName });
      }
    }

    window.addEventListener('message', handleMessage);
  });
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

/** Render status */
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

  // inject the listener into parent
  injectParentListener();

  try {
    const { pageUrl, pageName } = await getPageInfo();
    const payload = { pageUrl, pageName };

    console.log('DEBUG payload to webhook:', payload);

    await postToWebhook(payload);

    render(`Review request submitted. Page: ${pageName} (${pageUrl})`, 'success');
  } catch (err) {
    render(`Request Failed: ${err.message}`, 'error');
  }
});

/** --- Parent page listener (auto-injected) --- */
if (window === window.top) {
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GET_PAGE_URL') {
      event.source.postMessage({ type: 'PAGE_URL', url: window.location.href }, event.origin);
    }
  });
}
