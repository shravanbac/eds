/* eslint-disable no-console */
(function main() {
  async function getPageInfo() {
    let url = '';

    try {
      // Prefer referrer because iframe opens in sidekick
      if (document.referrer) {
        url = document.referrer;
      } else if (window.parent && window.parent.location) {
        url = window.parent.location.href;
      } else {
        url = window.location.href;
      }
    } catch (e) {
      console.warn('Page URL extraction failed, falling back to location.href', e);
      url = window.location.href;
    }

    // Default pageName
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

    return { pageUrl: url, pageName };
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
      details.innerHTML = `<div class="review-card"><p class="status ${
        success ? 'success' : 'error'
      }">${msg}</p></div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    renderMessage('Submitting review request...', true);

    const info = await getPageInfo();
    const payload = { pageUrl: info.pageUrl, pageName: info.pageName };

    console.debug('DEBUG payload to webhook:', payload);

    const ok = await sendToWebhook(payload);
    if (ok) {
      renderMessage(
        `Review request submitted. Page: ${
          info.pageName
        } (${
          info.pageUrl
        })`,
        true,
      );
    } else {
      renderMessage('Review request failed. Please try again.', false);
    }
  });
}());
