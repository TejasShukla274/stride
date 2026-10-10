/* Stride start-up: first render, sensors, lifecycle listeners. */
R();
stepsInit(false);
S.dayKey = Store.dayKey();
S.stepsToday = Store.stepsToday();
setInterval(dayCheck, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) onResume(); });
window.Capacitor?.Plugins?.App?.addListener('appStateChange', st => { if (st.isActive) onResume(); });
setTimeout(() => {
  window.Capacitor?.Plugins?.SplashScreen?.hide();
  if (S.s == 'splash') go(S.in ? 'home' : 'login');
  const ses = Store.getSession();
  if (ses && ses.run) setTimeout(restoreSheet, 500);
}, 1500);
