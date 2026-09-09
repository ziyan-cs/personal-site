(() => {
  const config = window.EMAILJS_CONFIG;

  window.EMAILJS_READY = false;

  if (!window.emailjs || !config?.publicKey) return;

  window.emailjs.init({
    publicKey: config.publicKey,
    blockHeadless: true,
    limitRate: {
      id: 'ziyan-cs-contact',
      throttle: 60_000,
    },
  });

  window.EMAILJS_READY = true;
})();
