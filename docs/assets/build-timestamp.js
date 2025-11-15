const PLACEHOLDER_SENTINEL = ['__BUILD', '_TIMESTAMP__'].join('');
const RAW_BUILD_TIMESTAMP = PLACEHOLDER_SENTINEL;
const FALLBACK_MESSAGE = 'Build timestamp unavailable';

function ensureBadge(target) {
  const existing = target.querySelector('[data-build-timestamp]');
  if (existing) {
    return existing;
  }

  const badge = document.createElement('span');
  badge.className = 'build-badge';
  badge.dataset.buildTimestamp = RAW_BUILD_TIMESTAMP;
  badge.dataset.fallback = FALLBACK_MESSAGE;
  badge.textContent = FALLBACK_MESSAGE;
  target.appendChild(badge);
  return badge;
}

function formatTimestamp(rawValue) {
  if (!rawValue || rawValue === PLACEHOLDER_SENTINEL) {
    return null;
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    return {
      label: formatter.format(parsed),
      tooltip: parsed.toISOString()
    };
  } catch (error) {
    console.warn('Unable to format build timestamp', error);
    return {
      label: parsed.toLocaleString(),
      tooltip: parsed.toISOString()
    };
  }
}

function updateBadge(badge) {
  const rawValue = badge.dataset.buildTimestamp || RAW_BUILD_TIMESTAMP;
  const formatted = formatTimestamp(rawValue);

  if (!formatted) {
    const fallbackText = badge.dataset.fallback || badge.textContent?.trim() || FALLBACK_MESSAGE;
    badge.textContent = fallbackText;
    badge.removeAttribute('title');
    return;
  }

  badge.dataset.buildTimestamp = rawValue;
  badge.textContent = `Last build: ${formatted.label}`;
  badge.title = formatted.tooltip;
}

function wireUpFooterYear() {
  const footerYear = document.querySelector('#footer-year');
  if (footerYear) {
    footerYear.textContent = String(new Date().getFullYear());
  }
}

function init() {
  const targets = document.querySelectorAll('[data-build-badge-target]');
  if (targets.length === 0) {
    return;
  }

  for (const target of targets) {
    const badge = ensureBadge(target);
    updateBadge(badge);
  }

  wireUpFooterYear();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
