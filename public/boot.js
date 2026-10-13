/* Stride start-up: first render, sensors, lifecycle listeners. */
R();
stepsInit(false);
S.dayKey = Store.dayKey();
S.stepsToday = Store.stepsToday();
setInterval(dayCheck, 30000);
document.addEventListener('visibilitychange', () => { if (document.hidden) publishWidgets(true); else onResume(); });
window.Capacitor?.Plugins?.App?.addListener('appUrlOpen', e => { if (S.s === 'splash') window.__pendingLink = e.url; else routeLink(e.url); });
window.Capacitor?.Plugins?.App?.getLaunchUrl?.().then(r => { if (r && r.url) window.__pendingLink = r.url; }).catch(() => {});
window.Capacitor?.Plugins?.App?.addListener('appStateChange', st => { if (st.isActive) onResume(); });
setTimeout(() => {
  window.Capacitor?.Plugins?.SplashScreen?.hide();
  if (S.s == 'splash') go(S.in ? 'home' : 'login');
  if (window.__pendingLink) { routeLink(window.__pendingLink); window.__pendingLink = null; }
  publishWidgets(true);
  const ses = Store.getSession();
  if (ses && ses.run) setTimeout(restoreSheet, 500);
}, 1500);
