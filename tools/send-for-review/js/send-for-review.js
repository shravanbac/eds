/* eslint-disable no-console */
(function main() {
  function getPageInfo() {
    let url = '';
    let pageName = 'index';

    try {
      const params = new URLSearchParams(window.location.search);
      const previewHost = params.get('previewHost');
      const path = params.get('path');

      if (previewHost && path) {
        url = `https://${previewHost}${path}`;
        pageName = path.split('/').filter(Boolean).pop() || 'index';
      } else {
        // fallback: try referrer
        url = document.referrer || window.location.href;
        const u = new URL(url);
        const p = u.pathname.replace(/^\/+/, '');
        if (p) {
          pageName = (p.split('/').filter(Boolean).pop() || 'index')
            .replace(/\.[^.]+$/, '') || 'index';
        }
      }
    } catch (e) {
      console.warn('Page info extraction failed, fallback to location.href', e);
      url = window.location.href;
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
      details.innerHTML = `<div class="review-card"><p class="status ${success ? 'success' : 'error'}">${msg}</p></div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    renderMessage('Submitting review request...', true);

    const info = getPageInfo();
    const payload = { pageUrl: info.pageUrl, pageName: info.pageName };

    console.debug('DEBUG payload to webhook:', payload);

    const ok = await sendToWebhook(payload);
    if (ok) {
      renderMessage(
        `Review request submitted. Page: ${info.pageName} (${info.pageUrl})`,
        true,
      );
    } else {
      renderMessage('Review request failed. Please try again.', false);
    }
  });
}());
