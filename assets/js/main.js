const navMenu = document.getElementById('nav-menu');
const navToggle = document.getElementById('nav-toggle');
const navClose = document.getElementById('nav-close');
const header = document.getElementById('header');
const contactForm = document.getElementById('contact-form');

navToggle?.addEventListener('click', () => {
  navMenu?.classList.add('show-menu');
});

navClose?.addEventListener('click', () => {
  navMenu?.classList.remove('show-menu');
});

document.querySelectorAll('.nav .nav__link, .nav .nav__contact').forEach((link) => {
  link.addEventListener('click', () => navMenu?.classList.remove('show-menu'));
});

document.querySelector('.nav__link[href="#home"]')?.addEventListener('click', (event) => {
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

const updateHeader = () => {
  header?.classList.toggle('scroll-header', window.scrollY > 48);
};

window.addEventListener('scroll', updateHeader, { passive: true });
updateHeader();

if (contactForm) {
  const fields = [...contactForm.querySelectorAll('input:not([data-honeypot]), textarea')];
  const historyFields = [...contactForm.querySelectorAll('[data-history-field]')];
  const messageField = contactForm.elements.message;
  const honeypotField = contactForm.querySelector('[data-honeypot]');
  const messageCounter = document.getElementById('message-counter');
  const sendButton = document.getElementById('send-message');
  const sendButtonLabel = sendButton?.querySelector('.contact__button-label');
  const sendButtonIcon = sendButton?.querySelector('.contact__button-icon');
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
      // EmailJS still works when local storage is unavailable.
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

  function emailJsIsConfigured() {
    const config = window.EMAILJS_CONFIG;

    return Boolean(
      window.emailjs &&
      window.EMAILJS_READY &&
      config?.publicKey &&
      config?.serviceId &&
      config?.templateId &&
      !Object.values(config).some((value) => value.startsWith('YOUR_')),
    );
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

    if (!emailJsIsConfigured()) {
      setButtonState('error', 'EmailJS setup required', 'ri-alert-line');
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
      const config = window.EMAILJS_CONFIG;
      await window.emailjs.sendForm(config.serviceId, config.templateId, contactForm);

      saveSuccessfulSend();
      contactForm.reset();
      fields.forEach((field) => setFieldError(field));
      updateMessageCounter();
      setButtonState('success', 'Message sent', 'ri-check-line');
      setTimeout(startCooldown, 2400);
    } catch {
      setButtonState('error', 'Send failed · Retry', 'ri-refresh-line');
      setTimeout(startCooldown, 3200);
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (!hasDraft()) return;

    event.preventDefault();
    event.returnValue = '';
  });
}

/* Persistent custom cursor: the OS cursor remains hidden inside the page. */
const cursorMedia = window.matchMedia('(hover: hover) and (pointer: fine)');

if (cursorMedia.matches) {
  const cursor = document.createElement('span');
  let hasPointerPosition = false;

  cursor.className = 'light-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  document.body.append(cursor);

  const updateCursor = (event) => {
    cursor.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate(-50%, -50%)`;

    if (!hasPointerPosition || !cursor.classList.contains('is-visible')) {
      cursor.classList.add('is-visible');
      hasPointerPosition = true;
    }
  };

  const hideCursor = () => {
    cursor.classList.remove('is-visible');
  };

  window.addEventListener('pointermove', updateCursor, { passive: true });
  document.documentElement.addEventListener('pointerenter', updateCursor, { passive: true });
  document.documentElement.addEventListener('pointerleave', hideCursor, { passive: true });

  document.addEventListener('compositionstart', () => {
    if (hasPointerPosition) cursor.classList.add('is-visible');
  });
}
