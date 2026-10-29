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
  try { await navigator.clipboard.writeText(document.getElementById(button.dataset.copy).textContent); button.textContent = 'Copied'; }
  catch { button.textContent = 'Select text to copy'; }
  setTimeout(() => { button.textContent = 'Copy'; }, 2200);
}));

// Deliberately an in-memory illustration, with no Google or tracker storage access.
let tab = 'habits', walk = true, pages = 10, sets = 2, pending = 0;
const content = document.querySelector('#demo-content');
const status = document.querySelector('#demo-status');
const offline = document.querySelector('#offline');
const tabs = [...document.querySelectorAll('[data-tab]')];
function render() {
  content.innerHTML = tab === 'habits'
    ? `<div class="demo-row"><span class="row-symbol" aria-hidden="true">✓</span><div><strong>Go for a walk</strong><small>Checkmark habit</small></div><button id="walk-demo" aria-label="Go for a walk" aria-pressed="${walk}">${walk ? '✓' : '—'}</button></div><div class="demo-row"><span class="row-symbol" aria-hidden="true">▤</span><div><strong>Read a little</strong><small>Pages read today</small></div><button id="pages-demo" aria-label="Add one page, currently ${pages}">${pages} +</button></div>`
    : `<div class="demo-row"><span class="row-symbol" aria-hidden="true">↗</span><div><strong>Bench press</strong><small>${Array.from({length: sets}, () => '5 × 60 kg').join(' · ')}</small></div><button id="sets-demo" aria-label="Add a sample set" ${sets >= 5 ? 'disabled' : ''}>+</button></div><div class="demo-row"><span class="row-symbol" aria-hidden="true">↗</span><div><strong>Squat</strong><small>8 × 40 kg · 8 × 40 kg</small></div></div>`;
  document.querySelector('#walk-demo')?.addEventListener('click', () => { walk = !walk; change(); });
  document.querySelector('#pages-demo')?.addEventListener('click', () => { pages++; change(); });
  document.querySelector('#sets-demo')?.addEventListener('click', () => { sets++; change(); });
}
function change() { pending++; render(); status.textContent = `${pending} sample ${pending === 1 ? 'change' : 'changes'} waiting. ${offline.checked ? 'Reconnect to simulate sending.' : 'Try simulating sync.'}`; }
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
offline.addEventListener('change', () => { status.textContent = offline.checked ? 'Offline simulation. Your sample edits stay in this preview.' : `Online simulation. ${pending} sample changes waiting.`; });
document.querySelector('#sync-demo').addEventListener('click', () => {
  if (offline.checked) { status.textContent = 'Turn off Simulate offline before sending sample changes.'; return; }
  status.textContent = pending ? `Simulated sync complete for ${pending} sample changes. No data was sent.` : 'No sample changes waiting. Try changing a value.'; pending = 0;
});
render();
