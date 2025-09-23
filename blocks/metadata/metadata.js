/**
 * Metadata Block
 * Converts table rows into <meta> tags.
 * Example: "Template ID" → <meta name="templateid" content="12345">
 */

export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];

  rows.forEach((row) => {
    const cells = [...row.children];
    if (cells.length < 2) {
      return;
    }

    const key = cells[0].textContent.trim();
    const value = cells[1].textContent.trim();

    if (key && value) {
      const meta = document.createElement('meta');
      // normalize key: remove spaces, lowercase
      const normalized = key.replace(/\s+/g, '').toLowerCase();
      meta.setAttribute('name', normalized);
      meta.setAttribute('content', value);
      document.head.appendChild(meta);
    }
  });
}
