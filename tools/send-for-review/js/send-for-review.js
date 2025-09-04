// send-for-review.js

(function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .loading { color: #666; font-style: italic; }
    .success { color: green; font-weight: bold; }
    .error { color: red; font-weight: bold; }
  `;
  document.head.appendChild(style);
}());

function getPageInfo() {
  const params = new URLSearchParams(window.location.search);
  let url = params.get('referrer');

  // If Sidekick didn't substitute the referrer, treat it as missing
  if (!url || url.indexOf('{referrer}') !== -1 || url.indexOf('referrer') !== -1) {
    url = document.referrer
      || (window.parent && window.parent.location && window.parent.location.href)
      || window.location.href;
  }

  let pageName = 'index';
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+/, '');
    if (path) {
      pageName = (path.split('/').filter(Boolean).pop() || 'index')
        .replace(/\.[^.]+$/, '') || 'index';
    }
  } catch (e) {
    // Ignore invalid URL parsing
  }

  return { pageUrl: url, pageName };
}

async function sendForReview() {
  const details = document.getElementById('details');
  details.innerHTML = '<p class="loading">Submitting review request…</p>';

  try {
    const { pageUrl, pageName } = getPageInfo();
    const payload = { pageUrl, pageName };

    // 🔗 Replace with your actual webhook
    const webhook = 'https://hook.us2.make.com/6wpuu9mtglv89lsj6acwd8tvbgrfbnko';

    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Webhook returned ${res.status}`);
    }

    details.innerHTML = (
      '<p class="success">'
        + 'Review request submitted.<br/>'
        + `Page: <b>${pageName}</b><br/>`
        + `(<a href="${pageUrl}" target="_blank">${pageUrl}</a>)`
      + '</p>'
    );
  } catch (e) {
    details.innerHTML = `<p class="error">Request failed: ${e.message}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  sendForReview();
});
