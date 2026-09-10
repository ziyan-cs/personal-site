const navMenu = document.getElementById('nav-menu');
const navToggle = document.getElementById('nav-toggle');
const navClose = document.getElementById('nav-close');
const navScrim = document.getElementById('nav-scrim');
const header = document.getElementById('header');
const contactForm = document.getElementById('contact-form');

const setMobileMenu = (isOpen) => {
  navMenu?.classList.toggle('show-menu', isOpen);
  navScrim?.classList.toggle('show-menu', isOpen);
  navToggle?.setAttribute('aria-expanded', String(isOpen));
  document.body.classList.toggle('nav-open', isOpen);
};

navToggle?.addEventListener('click', () => {
  setMobileMenu(!navMenu?.classList.contains('show-menu'));
});

navClose?.addEventListener('click', () => {
  setMobileMenu(false);
});

navScrim?.addEventListener('click', () => {
  setMobileMenu(false);
});

document.addEventListener('pointerdown', (event) => {
  if (!navMenu?.classList.contains('show-menu')) return;
  if (navMenu.contains(event.target) || navToggle?.contains(event.target)) return;

  event.preventDefault();
  setMobileMenu(false);
}, { capture: true });

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && navMenu?.classList.contains('show-menu')) {
    setMobileMenu(false);
    navToggle?.focus();
  }
});

window.addEventListener('resize', () => {
  if (window.innerWidth >= 1024) setMobileMenu(false);
}, { passive: true });

document.querySelectorAll('#nav-menu .nav__link').forEach((link) => {
  link.addEventListener('click', () => setMobileMenu(false));
});

document.querySelector('.nav__link[href="#home"]')?.addEventListener('click', (event) => {
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

const updateHeader = () => {
  header?.classList.toggle('scroll-header', window.scrollY > 48);
};

const navSectionLinks = [...document.querySelectorAll('#nav-menu .nav__link[href^="#"]')];
const navSections = navSectionLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);
let navigationClickTarget = null;
let navigationReleaseTimer;

const setActiveNavigation = (href) => {
  navSectionLinks.forEach((link) => {
    link.classList.toggle('active-link', link.getAttribute('href') === href);
  });
};

const updateActiveNavigation = () => {
  const marker = window.scrollY + Math.min(window.innerHeight * .35, 260);
  let activeSection = navSections[0];

  navSections.forEach((section) => {
    if (section.offsetTop <= marker) activeSection = section;
  });

  if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) {
    activeSection = navSections.at(-1);
  }

  setActiveNavigation(`#${activeSection?.id}`);
};

const finishNavigationScroll = () => {
  if (!navigationClickTarget) return;

  navigationClickTarget = null;
  clearTimeout(navigationReleaseTimer);
  updateActiveNavigation();
};

navSectionLinks.forEach((link) => {
  link.addEventListener('click', () => {
    const href = link.getAttribute('href');
    navigationClickTarget = href;
    setActiveNavigation(href);

    clearTimeout(navigationReleaseTimer);
    navigationReleaseTimer = setTimeout(finishNavigationScroll, 1400);
  });
});

window.addEventListener('scroll', updateHeader, { passive: true });
window.addEventListener('scroll', () => {
  if (!navigationClickTarget) updateActiveNavigation();
}, { passive: true });
window.addEventListener('resize', updateActiveNavigation, { passive: true });
window.addEventListener('scrollend', finishNavigationScroll, { passive: true });
updateHeader();
updateActiveNavigation();

const revealGroups = [
  ['#about .about__title', '#about .about__content'],
  ['#projects .section__title', '#projects .work__card'],
  ['#focus .section__title', '#focus .services__card'],
  ['#skills .section__title', '#skills .skills__description', '#skills .learning__step'],
  ['#contact .section__title', '#contact .contact__form', '#contact .contact__details'],
  ['.footer__quote', '.footer__right', '.footer__copy']
];

const revealElements = [];

revealGroups.forEach((selectors) => {
  const groupElements = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);

  groupElements.forEach((element, index) => {
    element.classList.add('scroll-reveal');
    element.style.setProperty('--reveal-delay', `${Math.min(index * 85, 255)}ms`);
    revealElements.push(element);
  });
});

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const initiallyVisible = revealElements.filter((element) => element.getBoundingClientRect().top < window.innerHeight);

initiallyVisible.forEach((element) => element.classList.add('is-visible', 'reveal-complete'));
document.documentElement.classList.add('reveal-ready');

if (reduceMotion || !('IntersectionObserver' in window)) {
  revealElements.forEach((element) => element.classList.add('is-visible', 'reveal-complete'));
} else {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      entry.target.classList.add('is-visible');
      entry.target.addEventListener('transitionend', () => {
        entry.target.classList.add('reveal-complete');
      }, { once: true });
      observer.unobserve(entry.target);
    });
  }, {
    threshold: .12,
    rootMargin: '0px 0px -8% 0px'
  });

  revealElements
    .filter((element) => !element.classList.contains('is-visible'))
    .forEach((element) => revealObserver.observe(element));
}

if (contactForm) {
  const fields = [...contactForm.querySelectorAll('input:not([data-honeypot]), textarea')];
  const historyFields = [...contactForm.querySelectorAll('[data-history-field]')];
  const messageField = contactForm.elements.message;
  const honeypotField = contactForm.querySelector('[data-honeypot]');
  const messageCounter = document.getElementById('message-counter');
  const sendButton = document.getElementById('send-message');
  const sendButtonLabel = sendButton?.querySelector('.contact__button-label');
  const sendButtonIcon = sendButton?.querySelector('.contact__button-icon');
  const turnstileMount = document.getElementById('contact-turnstile');
  const contactWorkerConfig = window.CONTACT_WORKER_CONFIG || {};
  const storageKey = 'ziyan-cs.contact-history';
  const sendLogKey = 'ziyan-cs.contact-send-log';
  const historyLimit = 6;
  const dailySendLimit = 5;
  const sendCooldown = 60 * 1000;
  const sendWindow = 24 * 60 * 60 * 1000;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const earliestSubmitTime = Date.now() + 1500;
  const hasDraft = () => fields.some((field) => field.value.trim() !== '');
  let cooldownTimer;
  let turnstileToken = '';
  let turnstileWidgetId;
  let contactHistory = loadHistory();

  function loadHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));

      return {
        name: Array.isArray(saved?.name) ? saved.name.filter((value) => typeof value === 'string') : [],
        email: Array.isArray(saved?.email) ? saved.email.filter((value) => typeof value === 'string') : [],
      };
    } catch {
      return { name: [], email: [] };
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(contactHistory));
    } catch {
      // Browsing modes that block local storage still keep the form usable.
    }
  }

  function loadSendLog() {
    try {
      const now = Date.now();
      const saved = JSON.parse(localStorage.getItem(sendLogKey));

      return Array.isArray(saved)
        ? saved.filter((timestamp) => Number.isFinite(timestamp) && now - timestamp < sendWindow)
        : [];
    } catch {
      return [];
    }
  }

  function saveSuccessfulSend() {
    try {
      localStorage.setItem(sendLogKey, JSON.stringify([...loadSendLog(), Date.now()]));
    } catch {
      // Form delivery remains available when local storage is unavailable.
    }
  }

  function setButtonState(state, label, iconClass) {
    if (!sendButton || !sendButtonLabel || !sendButtonIcon) return;

    sendButton.classList.remove('is-sending', 'is-success', 'is-error');
    if (state !== 'default' && state !== 'cooldown' && state !== 'limit') {
      sendButton.classList.add(`is-${state}`);
    }

    sendButton.disabled = ['sending', 'success', 'cooldown', 'limit'].includes(state);
    sendButtonLabel.textContent = label;
    sendButtonIcon.className = `${iconClass} contact__button-icon`;
  }

  function startCooldown() {
    clearTimeout(cooldownTimer);

    const sendLog = loadSendLog();
    const now = Date.now();

    if (sendLog.length >= dailySendLimit) {
      setButtonState('limit', 'Daily limit reached', 'ri-time-line');
      cooldownTimer = setTimeout(startCooldown, sendLog[0] + sendWindow - now + 100);
      return;
    }

    const lastSend = sendLog.at(-1) || 0;
    const secondsRemaining = Math.ceil((lastSend + sendCooldown - now) / 1000);

    if (secondsRemaining > 0) {
      setButtonState('cooldown', `Send again in ${secondsRemaining}s`, 'ri-time-line');
      cooldownTimer = setTimeout(startCooldown, 1000);
      return;
    }

    setButtonState('default', 'Send message', 'ri-arrow-right-line');
  }

  function workerIsConfigured() {
    const { endpoint, turnstileSiteKey } = contactWorkerConfig;

    return Boolean(
      typeof endpoint === 'string' &&
      typeof turnstileSiteKey === 'string' &&
      endpoint.startsWith('https://') &&
      turnstileSiteKey.length > 10,
    );
  }

  function resetTurnstile() {
    turnstileToken = '';
    if (turnstileWidgetId !== undefined && window.turnstile) {
      window.turnstile.reset(turnstileWidgetId);
    }
  }

  function initializeTurnstile() {
    if (!workerIsConfigured() || !turnstileMount) return;

    turnstileMount.hidden = false;

    const render = () => {
      if (!window.turnstile || turnstileWidgetId !== undefined) return;

      turnstileWidgetId = window.turnstile.render(turnstileMount, {
        sitekey: contactWorkerConfig.turnstileSiteKey,
        action: 'contact',
        theme: 'dark',
        size: 'flexible',
        callback(token) {
          turnstileToken = token;
        },
        'expired-callback'() {
          turnstileToken = '';
        },
        'error-callback'() {
          turnstileToken = '';
        },
      });
    };

    if (window.turnstile) {
      render();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = render;
    document.head.append(script);
  }

  async function sendWithWorker() {
    const response = await fetch(contactWorkerConfig.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: contactForm.elements.name.value.trim(),
        email: contactForm.elements.email.value.trim(),
        message: contactForm.elements.message.value.trim(),
        website: honeypotField?.value || '',
        turnstileToken,
      }),
    });

    if (response.ok) return;

    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || 'Send failed');
    error.status = response.status;
    throw error;
  }

  function setFieldError(field, message = '') {
    const container = field.closest('.contact__field');
    const error = container?.querySelector('.contact__error');
    const isInvalid = Boolean(message);

    field.setAttribute('aria-invalid', String(isInvalid));
    container?.classList.toggle('contact__field--invalid', isInvalid);

    if (error) {
      error.hidden = !isInvalid;
      error.querySelector('span').textContent = message;
    }
  }

  function validateForm() {
    const name = contactForm.elements.name;
    const email = contactForm.elements.email;
    const message = contactForm.elements.message;

    setFieldError(name, name.value.trim() ? '' : 'Required');
    setFieldError(
      email,
      !email.value.trim()
        ? 'Required'
        : emailPattern.test(email.value.trim())
          ? ''
          : 'Invalid email',
    );
    setFieldError(message, message.value.trim() ? '' : 'Required');

    const firstInvalidField = fields.find((field) => field.getAttribute('aria-invalid') === 'true');
    firstInvalidField?.focus();
    if (firstInvalidField) closeHistoryMenus();

    return !firstInvalidField;
  }

  function rememberIdentity() {
    historyFields.forEach((field) => {
      const type = field.dataset.historyField;
      const value = field.querySelector('input').value.trim();

      contactHistory[type] = [
        value,
        ...contactHistory[type].filter((entry) => entry.toLocaleLowerCase() !== value.toLocaleLowerCase()),
      ].slice(0, historyLimit);
    });

    saveHistory();
  }

  function updateMessageCounter() {
    if (!messageCounter) return;

    const length = messageField.value.length;
    const limit = Number(messageField.maxLength);

    messageCounter.textContent = `${length} / ${limit}`;
    messageCounter.classList.toggle('is-near-limit', length >= limit * 0.8 && length < limit);
    messageCounter.classList.toggle('is-at-limit', length >= limit);
  }

  function closeHistoryMenus(except) {
    historyFields.forEach((field) => {
      if (field !== except) field.querySelector('.contact__history').hidden = true;
    });
  }

  function renderHistory(field) {
    const type = field.dataset.historyField;
    const input = field.querySelector('input');
    const menu = field.querySelector('.contact__history');
    const query = input.value.trim().toLocaleLowerCase();
    const entries = contactHistory[type].filter((value) =>
      value.toLocaleLowerCase().includes(query),
    );

    menu.replaceChildren();

    entries.forEach((value) => {
      const item = document.createElement('div');
      const selectButton = document.createElement('button');
      const deleteButton = document.createElement('button');

      item.className = 'contact__history-item';
      item.setAttribute('role', 'option');

      selectButton.type = 'button';
      selectButton.className = 'contact__history-select';
      selectButton.textContent = value;
      selectButton.addEventListener('click', () => {
        input.value = value;
        menu.hidden = true;
        input.focus();
      });

      deleteButton.type = 'button';
      deleteButton.className = 'contact__history-delete';
      deleteButton.setAttribute('aria-label', `Delete ${value}`);
      deleteButton.innerHTML = '<i class="ri-delete-bin-line" aria-hidden="true"></i>';
      deleteButton.addEventListener('click', (event) => {
        event.stopPropagation();
        contactHistory[type] = contactHistory[type].filter((entry) => entry !== value);
        saveHistory();
        renderHistory(field);
      });

      item.append(selectButton, deleteButton);
      menu.append(item);
    });

    menu.hidden = entries.length === 0;
  }

  historyFields.forEach((field) => {
    const input = field.querySelector('input');

    ['focus', 'click', 'input'].forEach((eventName) => {
      input.addEventListener(eventName, () => {
        closeHistoryMenus(field);
        renderHistory(field);
      });
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') field.querySelector('.contact__history').hidden = true;
    });
  });

  fields.forEach((field) => {
    field.addEventListener('input', () => setFieldError(field));
  });

  messageField.addEventListener('input', updateMessageCounter);
  updateMessageCounter();
  initializeTurnstile();
  startCooldown();

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-history-field]')) closeHistoryMenus();
  });

  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    closeHistoryMenus();

    if (!validateForm()) return;

    if (honeypotField?.value || Date.now() < earliestSubmitTime) {
      setButtonState('error', 'Please wait a moment', 'ri-time-line');
      setTimeout(startCooldown, 2200);
      return;
    }

    rememberIdentity();

    const useContactWorker = workerIsConfigured();

    if (!useContactWorker) {
      setButtonState('error', 'Contact service unavailable', 'ri-alert-line');
      setTimeout(startCooldown, 3200);
      return;
    }

    if (useContactWorker && !turnstileToken) {
      setButtonState('error', 'Complete verification', 'ri-shield-check-line');
      setTimeout(startCooldown, 3200);
      return;
    }

    const sendLog = loadSendLog();

    if (sendLog.length >= dailySendLimit || Date.now() - (sendLog.at(-1) || 0) < sendCooldown) {
      startCooldown();
      return;
    }

    setButtonState('sending', 'Sending…', 'ri-loader-4-line');

    try {
      await sendWithWorker();

      saveSuccessfulSend();
      contactForm.reset();
      resetTurnstile();
      fields.forEach((field) => setFieldError(field));
      updateMessageCounter();
      setButtonState('success', 'Message sent', 'ri-check-line');
      setTimeout(startCooldown, 2400);
    } catch (error) {
      resetTurnstile();
      const label = error?.status === 429 ? 'Please try again later' : 'Send failed · Retry';
      setButtonState('error', label, 'ri-refresh-line');
      setTimeout(startCooldown, 3200);
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (!hasDraft()) return;

    event.preventDefault();
    event.returnValue = '';
  });
}
