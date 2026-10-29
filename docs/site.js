import { getLocale, setLocale, startLocale, subscribeLocale } from '../src/i18n/locale';
import { siteMessage as t } from '../src/i18n/site';
startLocale();
function translatePage() {
  document.querySelectorAll('[data-message]').forEach(element => { element.innerHTML = t(element.dataset.message); });
  for (const attribute of ['aria-label', 'content']) document.querySelectorAll(`[data-message-${attribute}]`).forEach(element => {
    element.setAttribute(attribute, t(element.getAttribute(`data-message-${attribute}`)));
  });
  document.querySelectorAll('[data-locale]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.locale === getLocale())));
}
document.querySelectorAll('[data-locale]').forEach(button => button.addEventListener('click', () => setLocale(button.dataset.locale)));
translatePage();
const sidebar = document.querySelector('#sidebar');
const menu = document.querySelector('.menu-button');
const closeMenu = () => { sidebar.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); };
menu.addEventListener('click', () => { const open = sidebar.classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); });
sidebar.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && sidebar.classList.contains('open')) { closeMenu(); menu.focus(); } });
const links = [...sidebar.querySelectorAll('a[href^="#"]')];
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    links.forEach(link => { if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
  }
}, { rootMargin: '-15% 0px -65% 0px' });
document.querySelectorAll('main>section').forEach(section => observer.observe(section));
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(document.getElementById(button.dataset.copy).textContent); button.textContent = t('copy.success'); }
  catch { button.textContent = t('copy.failed'); }
  setTimeout(() => { button.textContent = t('deployment.copy'); }, 2200);
}));

// Deliberately an in-memory illustration, with no Google or tracker storage access.
let tab = 'habits', walk = true, pages = 10, sets = 2, pending = 0;
const content = document.querySelector('#demo-content');
const status = document.querySelector('#demo-status');
let statusKey = 'preview.ready', statusValues = {};
const updateStatus = (key, values = {}) => { statusKey = key; statusValues = values; status.textContent = t(key, values); };
let changed = false;
const offline = document.querySelector('#offline');
const tabs = [...document.querySelectorAll('[data-tab]')];
function render() {
  content.innerHTML = tab === 'habits'
    ? `<div class="demo-row"><span class="row-symbol" aria-hidden="true">✓</span><div><strong>${t('demo.walk')}</strong><small>${t('demo.checkmark')}</small></div><button id="walk-demo" aria-label="${t('demo.walk')}" aria-pressed="${walk}">${walk ? '✓' : '—'}</button></div><div class="demo-row"><span class="row-symbol" aria-hidden="true">▤</span><div><strong>${t('demo.read')}</strong><small>${t('demo.pages')}</small></div><button id="pages-demo" aria-label="${t('demo.addPage', { count: pages })}">${pages} +</button></div>`
    : `<div class="demo-row"><span class="row-symbol" aria-hidden="true">↗</span><div><strong>${t('demo.bench')}</strong><small>${Array.from({length: sets}, () => '5 × 60 kg').join(' · ')}</small></div><button id="sets-demo" aria-label="${t('demo.addSet')}" ${sets >= 5 ? 'disabled' : ''}>+</button></div><div class="demo-row"><span class="row-symbol" aria-hidden="true">↗</span><div><strong>${t('demo.squat')}</strong><small>8 × 40 kg · 8 × 40 kg</small></div></div>`;
  document.querySelector('#walk-demo')?.addEventListener('click', () => { walk = !walk; change(); });
  document.querySelector('#pages-demo')?.addEventListener('click', () => { pages++; change(); });
  document.querySelector('#sets-demo')?.addEventListener('click', () => { sets++; change(); });
}
function showPending() {
  const category = new Intl.PluralRules(getLocale()).select(pending);
  const key = `demo.pending.${['one','few'].includes(category) ? category : 'other'}`;
  status.textContent = `${t(key, { count: pending })} ${t(offline.checked ? 'demo.reconnect' : 'demo.trySync')}`;
}
function change() { pending++; changed = true; render(); showPending(); }
tabs.forEach((button, index) => {
  button.addEventListener('click', () => {
    tab = button.dataset.tab;
    tabs.forEach(item => { const active = item === button; item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1; });
    document.querySelector('#demo-panel').setAttribute('aria-labelledby', button.id); render();
  });
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click(); tabs[next].focus();
  });
});
offline.addEventListener('change', () => { changed = false; updateStatus(offline.checked ? 'demo.offline' : 'demo.online', { count: pending }); });
document.querySelector('#sync-demo').addEventListener('click', () => {
  changed = false;
  if (offline.checked) { updateStatus('demo.syncBlocked'); return; }
  updateStatus(pending ? 'demo.synced' : 'demo.empty', { count: pending }); pending = 0;
});
subscribeLocale(() => { translatePage(); render(); if (changed) showPending(); else updateStatus(statusKey, statusValues); });
render();
