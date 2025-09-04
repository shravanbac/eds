/* eslint-disable no-console */
(function main() {
  function getPageInfo() {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('pageUrl') || document.referrer || window.location.href;

    let pageName = 'index';
    try {
      const u = new URL(url);
      const segments = u.pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        pageName = segments.pop().replace(/\.[^.]+$/, '') || 'index';
      }
      return { pageUrl: u.href, pageName };
    } catch (e) {
      console.warn('Page info extraction failed', e);
      return { pageUrl: url, pageName };
    }
  }

  async function sendToWebhook(payload) {
    try {
      const webhookUrl = window.SFR_WEBHOOK_URL
        || 'https://hook.us2.make.com/6wpuu9mtglv89lsj6acwd8tvbgrfbnko';
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch (e) {
      console.error('Webhook call failed', e);
      return false;
    }
  }

  function renderMessage(msg, success = true) {
    const details = document.getElementById('details');
    if (details) {
      details.innerHTML = `<div class="review-card"><p class="status ${success ? 'success' : 'error'}">${msg}</p></div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    renderMessage('Submitting review request...', true);

    const { pageUrl, pageName } = getPageInfo();
    const payload = { pageUrl, pageName };

    console.debug('DEBUG payload to webhook:', payload);

    const ok = await sendToWebhook(payload);
    if (ok) {
      renderMessage(`Review request submitted. Page: ${pageName} (${pageUrl})`, true);
    } else {
      renderMessage('Review request failed. Please try again.', false);
    }
  });
}());
