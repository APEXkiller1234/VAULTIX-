document.documentElement.classList.add('js-enabled');

const decodeHtmlEntities = (value) => {
  if (typeof value !== 'string') return value;

  return value
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d))
    .replace(/&(quot|apos|amp|lt|gt);/g, (_, entity) => ({
      quot: '"',
      apos: "'",
      amp: '&',
      lt: '<',
      gt: '>',
    }[entity] || _));
};document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({
    appCurrency: {
      ratesUsd: Object.fromEntries(Object.entries(window.currencyRatesUsd || {}).map(([key, value]) => [String(key).toLowerCase(), value])),
      currency: String(window.defaultCurrency || 'usd').toLowerCase(),

      convert(price, fromCurrency, toCurrency = this.currency) {
        const fromRate = this.ratesUsd[fromCurrency.toLowerCase()];
        const toRate = this.ratesUsd[toCurrency.toLowerCase()];

        if (fromCurrency === toCurrency) {
          return price;
        }

        if (!fromRate || !toRate) {
          console.error('Invalid currency conversion', { fromCurrency, toCurrency, rates: this.ratesUsd });
          return price;
        }

        return (price / fromRate) * toRate;
      },

      format(price, fromCurrency, locale = 'en-US') {
        const toCurrency = this.currency || fromCurrency;
        const convertedPrice = this.convert(price, fromCurrency, toCurrency);

        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: toCurrency,
          currencyDisplay: 'symbol',
        }).format(convertedPrice);
      },

      setCurrency(nextCurrency) {
        const normalizedCurrency = String(nextCurrency || '').trim().toLowerCase();
        this.ratesUsd = Object.fromEntries(Object.entries(this.ratesUsd || window.currencyRatesUsd || {}).map(([key, value]) => [String(key).toLowerCase(), value]));

        if (!normalizedCurrency || !this.ratesUsd[normalizedCurrency]) {
          console.warn('Ignored invalid currency selection', normalizedCurrency);
          return false;
        }

        this.currency = normalizedCurrency;
        localStorage.setItem('currency', this.currency);

        document.querySelectorAll('[data-currency-current]').forEach((element) => {
          element.textContent = this.currency.toUpperCase();
        });

        document.querySelectorAll('[data-currency-symbol]').forEach((element) => {
          element.textContent = (window.currencySymbols?.[this.currency] || window.currencySymbols?.[this.currency.toUpperCase?.()] || '$');
        });

        document.querySelectorAll('[data-currency-select]').forEach((element) => {
          if (element.value !== this.currency) element.value = this.currency;
        });

        window.dispatchEvent(new CustomEvent('currency:changed', { detail: { currency: this.currency } }));
        return true;
      },

      init() {
        const storedCurrency = localStorage.getItem('currency')?.toLowerCase();
        this.ratesUsd = Object.fromEntries(Object.entries(this.ratesUsd || window.currencyRatesUsd || {}).map(([key, value]) => [String(key).toLowerCase(), value]));

        if (storedCurrency && this.ratesUsd[storedCurrency]) {
          this.currency = storedCurrency;
        } else if (storedCurrency) {
          console.error('Invalid currency in local storage', storedCurrency, this.ratesUsd);
        }

        this.setCurrency(this.currency);
      },    },


    topUpBalance: {
      customAmount: '',
      buyingAmount: null,
      error: '',
      altchaPayload: null,

      init() {
        const altchaWidget = this.$refs?.altcha;
        if (altchaWidget?.addEventListener) {
          altchaWidget.addEventListener('statechange', (event) => {
            if (event.detail.state === 'verified') {
              this.altchaPayload = event.detail.payload;
            }
          });
        }
      },

      get checkoutEndpoint() {
        return `${window.apiBaseUrl}v1/checkout`;
      },

      get productId() {
        const value = Number(this.$root?.dataset?.balanceProductId);
        return Number.isFinite(value) ? value : null;
      },

      get variantId() {
        const value = Number(this.$root?.dataset?.balanceProductVariantId);
        return Number.isFinite(value) ? value : null;
      },

      get shopId() {
        return this.$root?.dataset?.shopId || window.shopId || '';
      },

      normalizeAmount(amount) {
        const parsed = Number(amount);
        if (!Number.isFinite(parsed)) {
          return null;
        }

        return Math.max(1, Math.round(parsed));
      },

      async checkout(amount, source = 'custom') {
        const normalized = this.normalizeAmount(amount);

        if (!normalized || this.buyingAmount !== null || !this.productId || !this.variantId) {
          return;
        }

        this.error = '';
        this.buyingAmount = source;

        const formData = {
          cart: [{
            productId: this.productId,
            variantId: this.variantId,
            quantity: normalized,
          }],
          currency: window.alpineApp?.appCurrency?.currency || window.defaultCurrency || 'usd',
          shopId: this.shopId,
        };

        if (window.shopCustomer?.email) {
          formData.email = window.shopCustomer.email;
        }

        if (this.altchaPayload) {
          formData.altcha = this.altchaPayload;
        }

        try {
          const response = await fetch(this.checkoutEndpoint, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
          });

          const responseData = await response.json();

          if (responseData.url) {
            window.location.href = responseData.url;
            return;
          }

          this.error = responseData?.message || 'Checkout could not be started.';
        } catch (error) {
          console.error('Balance checkout error:', error);
          this.error = 'Unexpected error. Please refresh the page and try again.';
        } finally {
          this.buyingAmount = null;
        }
      },

      async buyAmount(amount) {
        return this.checkout(amount, amount);
      },

      async buyCustom() {
        return this.checkout(this.customAmount || 0, 'custom');
      }
    },

    appCart: {
      items: [],

      updateLocalStorage: function () {
        localStorage.setItem('cart', JSON.stringify(this.items));
      },

      set: function (items) {
        this.items = items;
        this.updateLocalStorage();
      },

      add: function (productId, variantId, quantity, parentVariantId = null) {
        const item = this.items.find((item) => item.variantId === variantId && (!item.parentVariantId || item.parentVariantId === parentVariantId));

        if (item) {
          item.quantity += quantity;
        } else {
          this.items.push({ productId, variantId, quantity, parentVariantId });
        }

        this.updateLocalStorage();
      },

      remove: function (variantId, parentVariantId = null) {
        this.items = this.items.filter((item) => item.variantId !== variantId || (item.parentVariantId && item.parentVariantId !== parentVariantId));
        this.updateLocalStorage();
      },

      editQuantity: function (variantId, quantity) {
        const item = this.items.find((item) => item.variantId === variantId);
        item.quantity = quantity;
        this.updateLocalStorage();
      },

      isInCart: function (variantId, parentVariantId = null) {
        return this.items.some((item) => item.variantId === variantId && (!item.parentVariantId || item.parentVariantId === parentVariantId));
      },

      get countWithQuantities() {
        return this.items.reduce((acc, item) => {
          if (!item.parentVariantId) {
            return acc + item.quantity;
          }

          return acc;
        }, 0);
      },

      init: function () {
        if (localStorage.getItem('cart')) {
          try {
            this.items = JSON.parse(localStorage.getItem('cart'));
            if (!Array.isArray(this.items)) {
              this.items = [];
            }
          } catch (error) {
            console.error('Error parsing cart from local storage', error);
            this.items = [];
          }
        }
      }
    },

    appCustomer: {
      modalIsOpen: false,
      modalStep: 1,
      modalEmail: '',
      modalOtpDigits: Array(6).fill(''),
      modalEmailError: '',
      modalOtpError: '',
      modalLoading: false,
      altchaPayload: null,
      afterLoginPath: '/customer/dashboard',

      addAltchaEventListener: function () {
        const altchaWidget = window.alpineApp?.$refs?.['appCustomer.altcha'];

        if (!altchaWidget?.addEventListener) {
          return;
        }

        altchaWidget.addEventListener('statechange', (event) => {
          if (event.detail.state === 'verifying') {
            this.buyNowDisabled = true;
          } else if (event.detail.state === 'verified') {
            this.buyNowDisabled = false;
            this.altchaPayload = event.detail.payload;
          }
        });
      },

      modalOpen() {
        this.modalIsOpen = true;
        this.modalStep = 1;
        this.modalOtpDigits = Array(6).fill('');
        this.modalOtpError = '';
        this.modalEmailError = '';
        document.body.style.overflow = 'hidden';

        window.alpineApp?.$nextTick?.(() => {
          window.alpineApp?.$refs?.['appCustomer.modalEmailInput']?.focus();
        });
      },

      modalClose() {
        this.modalIsOpen = false;

        setTimeout(() => {
          this.modalEmail = '';
          this.modalOtpDigits = Array(6).fill('');
          this.modalStep = 1;
          this.modalEmailError = '';
          this.modalOtpError = '';
        }, 300); // Transition

        document.body.style.overflow = 'auto';
      },

      async modalRequestOtp() {
        this.modalEmailError = '';
        this.modalOtpError = '';
        this.modalLoading = true;

        try {
          const response = await fetch(`${window.apiBaseUrl}v1/customer-dashboard/request-otp`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: this.modalEmail,
              shop_id: window.shopId,
              altcha: this.altchaPayload
            })
          });

          const data = await response.json();

          if (data.success) {
            this.modalStep = 2;
            setTimeout(() => {
              window.alpineApp?.$refs?.['appCustomer.modalOtpInputs[0]']?.focus();
            }, 10);
          } else {
            this.modalEmailError = data?.message || 'Failed to send OTP. Please try again.';
          }
        } catch (error) {
          this.modalEmailError = 'Network error. Please try again.';
        } finally {
          this.modalLoading = false;
        }
      },

      modalOtpHandleInput(index) {
        const input = this.modalOtpDigits[index];

        if (input === '' || /^\d$/.test(input)) {
          if (input && index < this.modalOtpDigits.length - 1) {
            window.alpineApp?.$refs?.[`appCustomer.modalOtpInputs[${index + 1}]`]?.focus();
          }
        } else {
          this.modalOtpDigits[index] = '';
        }
      },

      modalOtpHandleKeyDown(index, event) {
        if (event.key === 'Backspace' && !this.modalOtpDigits[index] && index > 0) {
          window.alpineApp?.$refs?.[`appCustomer.modalOtpInputs[${index - 1}]`]?.focus();
        }
      },

      modalOtpHandlePaste(event) {
        event.preventDefault();
        const pastedData = event.clipboardData.getData('text');

        if (/^\d+$/.test(pastedData)) {
          const newOtp = pastedData.split('').slice(0, this.modalOtpDigits.length);

          newOtp.forEach((digit, index) => {
            this.modalOtpDigits[index] = digit;
          });

          for (let i = newOtp.length; i < this.modalOtpDigits.length; i++) {
            this.modalOtpDigits[i] = '';
          }

          window.alpineApp?.$refs?.[`appCustomer.modalOtpInputs[${this.modalOtpDigits.length - 1}]`]?.focus();
        }
      },

      async modalLogin() {
        const otp = this.modalOtpDigits.join('');

        if (otp.length !== 6) {
          this.modalOtpError = 'Invalid OTP.';
          return;
        }

        this.modalEmailError = '';
        this.modalOtpError = '';
        this.modalLoading = true;

        try {
          const formData = {
            email: this.modalEmail,
            otp: otp,
            shop_id: window.shopId,
          };

          const affiliate = localStorage.getItem('affiliate');
          if (affiliate) {
            formData.affiliate = affiliate;
          }

          const response = await fetch(`${window.apiBaseUrl}v1/customer-dashboard/login`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
          });

          const data = await response.json();

          if (data.token) {
            Cookies.set('shop_customer_token', data.token, { expires: 30, path: '/' });
            window.location.href = this.afterLoginPath || '/customer/dashboard';
          } else {
            this.modalOtpError = data?.message || 'Invalid credentials.';
          }
        } catch (error) {
          console.error(error);
          this.modalOtpError = error?.message || 'Invalid credentials.';
        } finally {
          this.modalLoading = false;
        }
      },

      loginOrRedirect() {
        if (window.shopCustomer) {
          window.location.href = '/customer/dashboard';
        } else {
          this.modalOpen();
        }
      },

      async logout() {
        const token = Cookies.get('shop_customer_token');

        if (!token) {
          return;
        }

        try {
          fetch(`${window.apiBaseUrl}v1/customer-dashboard/logout`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            }
          });
        } catch (error) {
          console.error('Logout error', error);
        }

        Cookies.remove('shop_customer_token');
        window.location.href = '/';
      },

      deleteModalIsOpen: false,
      deleteModalLoading: false,

      openDeleteModal() {
        this.deleteModalIsOpen = true;
        document.body.style.overflow = 'hidden';
      },

      closeDeleteModal() {
        this.deleteModalIsOpen = false;
        document.body.style.overflow = 'auto';
      },

      loggingOutOtherSessions: false,

      async logoutOtherSessions() {
        const token = Cookies.get('shop_customer_token');

        if (!token) {
          return;
        }

        this.loggingOutOtherSessions = true;

        try {
          const response = await fetch(`${window.apiBaseUrl}v1/customer-dashboard/logout-other-sessions`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            }
          });

          const data = await response.json();

          if (data.success) {
            window.location.reload();
          } else {
            console.error('Logout all devices error', data);
            alert(data.message || 'Failed to logout all devices. Please try again.');
          }
        } catch (error) {
          console.error('Logout other sessions error', error);
          alert('Network error. Please try again.');
        } finally {
          this.loggingOutOtherSessions = false;
        }
      },

      async deleteAccount() {
        const token = Cookies.get('shop_customer_token');

        if (!token) {
          return;
        }

        this.deleteModalLoading = true;

        try {
          const response = await fetch(`${window.apiBaseUrl}v1/customer-dashboard/delete-account`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          const data = await response.json();

          if (data.success) {
            Cookies.remove('shop_customer_token');
            window.location.href = '/';
          } else {
            console.error('Delete account error', data);
            alert(data.message || 'Failed to delete account. Please try again.');
          }
        } catch (error) {
          console.error('Delete account error', error);
          alert('Network error. Please try again.');
        } finally {
          this.deleteModalLoading = false;
          this.closeDeleteModal();
        }
      },

      init() {
        if (window.alpineApp?.$refs?.['appCustomer.altcha']) {
          this.addAltchaEventListener();
        }

        if (window.alpineApp?.$refs?.['appCustomer.modalOtpInputs[0]']) {
          window.alpineApp?.$refs?.['appCustomer.modalOtpInputs[0]'].addEventListener('paste', (event) => this.modalOtpHandlePaste(event));
        }

        const urlParams = new URLSearchParams(window.location.search);

        if (urlParams.get('login') === '1') {
          this.modalOpen();

          const back = urlParams.get('back');
          if (['dashboard', 'invoices', 'tickets', 'balance'].includes(back)) {
            urlParams.delete('login');
            urlParams.delete('back');
            this.afterLoginPath = `/customer/${back}?${urlParams.toString()}`;
          }
        }

        const affiliate = urlParams.get('a');
        if (affiliate) {
          localStorage.setItem('affiliate', affiliate);
        }
      }
    },

    appTickets: {
      modalIsOpen: false,
      invoiceId: '',
      subject: '',
      message: '',
      error: '',
      loading: false,

      modalOpen(invoiceId = '') {
        this.modalIsOpen = true;
        this.invoiceId = invoiceId;
        document.body.style.overflow = 'hidden';

        window.alpineApp?.$nextTick?.(() => {
          window.alpineApp?.$refs?.['appTickets.subjectInput']?.focus();
        });
      },

      modalClose() {
        this.modalIsOpen = false;

        setTimeout(() => {
          this.invoiceId = '';
          this.subject = '';
          this.message = '';
          this.error = '';
          this.loading = false;
        }, 300);

        document.body.style.overflow = 'auto';
      },

      async submitTicket() {
        const token = Cookies.get('shop_customer_token');

        if (!token) {
          return;
        }

        this.error = '';
        this.loading = true;

        try {
          const response = await fetch(`${window.apiBaseUrl}v1/customer-dashboard/tickets`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              invoice_id: this.invoiceId,
              subject: this.subject,
              content: this.message
            })
          });

          const data = await response.json();

          if (data.success) {
            this.modalClose();
            window.location.href = `/customer/tickets/${data?.ticket?.id}`;
          } else {
            this.error = data?.message || 'Failed to create ticket. Please try again.';
          }
        } catch (error) {
          this.error = 'Network error. Please try again.';
          console.error('Ticket creation error:', error);
        } finally {
          this.loading = false;
        }
      },

      init() {
        const urlParams = new URLSearchParams(window.location.search);
        const ticketInvoiceId = urlParams.get('ticket-invoice-id');
        if (ticketInvoiceId) {
          this.modalOpen(ticketInvoiceId);
        }
      }
    },

    appAffiliate: {
      modalEditCodeIsOpen: false,
      editCodeValue: '',
      editCodeError: '',
      editCodeLoading: false,

      modalEditCodeOpen(initialValue = '') {
        this.editCodeValue = initialValue;
        this.modalEditCodeIsOpen = true;
        document.body.style.overflow = 'hidden';

        window.alpineApp?.$nextTick?.(() => {
          window.alpineApp?.$refs?.['appAffiliate.editCodeInput']?.focus();
        });
      },

      modalEditCodeClose() {
        this.modalEditCodeIsOpen = false;

        setTimeout(() => {
          this.editCodeValue = '';
          this.error = '';
          this.loading = false;
        }, 300);

        document.body.style.overflow = 'auto';
      },

      async submitEditCode() {
        const token = Cookies.get('shop_customer_token');

        if (!token) {
          return;
        }

        this.editCodeError = '';
        this.editCodeLoading = true;

        try {
          const response = await fetch(`${window.apiBaseUrl}v1/customer-dashboard/affiliate/edit-code`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              affiliate_code: this.editCodeValue
            })
          });

          const data = await response.json();

          if (data.success) {
            this.modalClose();
            window.location.reload();
          } else {
            this.editCodeError = data?.message || 'Failed to update affiliate code. Please try again.';
          }
        } catch (error) {
          this.editCodeError = 'Network error. Please try again.';
          console.error('Affiliate code update error:', error);
        } finally {
          this.editCodeLoading = false;
        }
      }
    },

    appMaintenance: {
      modalIsOpen: false,
      modalPassword: '',
      modalError: '',
      modalLoading: false,

      modalOpen() {
        this.modalIsOpen = true;
        document.body.style.overflow = 'hidden';

        window.alpineApp?.$nextTick?.(() => {
          window.alpineApp?.$refs?.['appMaintenance.modalPasswordInput']?.focus();
        });
      },

      modalClose() {
        this.modalIsOpen = false;

        setTimeout(() => {
          this.modalPassword = '';
          this.modalError = '';
        }, 300); // Transition

        document.body.style.overflow = 'auto';
      },

      async modalLogin() {
        this.modalError = '';
        this.modalOtpError = '';
        this.modalLoading = true;

        try {
          const response = await fetch('/maintenance', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify({
              password: this.modalPassword,
            })
          });

          const data = await response.json();

          if (data.success) {
            window.location.href = '/';
          } else {
            this.modalError = data?.message || 'Failed to login. Please try again.';
            this.modalLoading = false;
          }
        } catch (error) {
          this.modalError = 'Network error. Please try again.';
          this.modalLoading = false;
        }
      },
    },

    init: function () {
      window.alpineApp = this;

      this.appCurrency.init();
      this.appCart.init();
      this.appCustomer.init();
      this.appTickets.init();
    }
  }));
});

function snow(config = {}) {
  const settings = {
    count: Math.min(config.count || 45, 60),
    minSize: config.minSize || 0.5,
    maxSize: config.maxSize || 1.0,
    minSpeed: config.minSpeed || 10,
    maxSpeed: config.maxSpeed || 30,
  };

  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

  let html = '', css = '';

  for (let i = 1; i < settings.count; i++) {
    html += '<i class="snowflake"></i>';

    const sizeMultiplier = settings.minSize + (Math.random() * (settings.maxSize - settings.minSize));
    const rndX = (rand(0, 1000000) * 0.0001);
    const rndO = rand(-100000, 100000) * 0.0001;
    const rndT = (rand(3, 8) * 10).toFixed(2);
    const rndS = (sizeMultiplier * rand(0, 10000) * 0.0001).toFixed(2);
    const animationDuration = rand(settings.minSpeed, settings.maxSpeed);

    css += '.snowflake:nth-child(' + i + ') {' +
      'opacity: ' + (rand(1, 10000) * 0.0001).toFixed(2) + ';' +
      'transform: translate(' + rndX.toFixed(2) + 'vw, -10px) scale(' + rndS + ');' +
      'animation: fall-' + i + ' ' + animationDuration + 's -' + rand(0, 30) + 's linear infinite' +
    '}' +
    '@keyframes fall-' + i + ' {' +
      rndT + '% {' +
        'transform: translate(' + (rndX + rndO).toFixed(2) + 'vw, ' + rndT + 'vh) scale(' + rndS + ')' +
      '}' +
      'to {' +
        'transform: translate(' + (rndX + (rndO / 2)).toFixed(2) + 'vw, 105vh) scale(' + rndS + ')' +
      '}' +
    '}';
  }

  document.getElementById('snow').innerHTML = html;

  const style = document.createElement('style');
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
}

function initPremiumCursor() {
  const isFinePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  if (!isFinePointer || !document.body) {
    return;
  }

  let dot = document.querySelector('.premium-cursor-dot');
  let ring = document.querySelector('.premium-cursor-ring');

  if (!dot || !ring) {
    const createCursorEl = (className) => {
      const element = document.createElement('div');
      element.className = className;
      document.body.appendChild(element);
      return element;
    };

    if (!dot) {
      dot = createCursorEl('premium-cursor-dot');
    }

    if (!ring) {
      ring = createCursorEl('premium-cursor-ring');
    }
  }

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  let rx = x;
  let ry = y;
  let visible = false;
  let rafId = 0;

  const render = () => {
    rx += (x - rx) * 0.12;
    ry += (y - ry) * 0.12;

    dot.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%)`;

    if (Math.abs(x - rx) > 0.18 || Math.abs(y - ry) > 0.18) {
      rafId = window.requestAnimationFrame(render);
      return;
    }

    rafId = 0;
  };

  const start = () => {
    if (!rafId) {
      rafId = window.requestAnimationFrame(render);
    }
  };

  const setVisible = (state) => {
    visible = state;
    dot.classList.toggle('premium-cursor-visible', state);
    ring.classList.toggle('premium-cursor-visible', state);

    if (state) {
      start();
    }
  };

  window.addEventListener('mousemove', (event) => {
    x = event.clientX;
    y = event.clientY;
    setVisible(true);
  }, { passive: true });

  window.addEventListener('mouseenter', () => {
    setVisible(true);
  });

  window.addEventListener('mouseleave', () => {
    visible = false;
    dot.classList.remove('premium-cursor-visible');
    ring.classList.remove('premium-cursor-visible');
    ring.classList.remove('is-hover');
  });

  const hoverSelector = 'a, button, input, select, textarea, [role="button"], .cursor-pointer, .premium-product-card, .premium-review-card, .premium-payment-method';

  document.addEventListener('pointerover', (event) => {
    if (event.target.closest(hoverSelector)) {
      ring.classList.add('is-hover');
    }
  }, { passive: true, capture: true });

  document.addEventListener('pointerout', (event) => {
    const from = event.target.closest(hoverSelector);
    const to = event.relatedTarget && event.relatedTarget.closest ? event.relatedTarget.closest(hoverSelector) : null;
    if (from && !to) {
      ring.classList.remove('is-hover');
    }
  }, { passive: true, capture: true });

  start();
}

function initPremiumReviewsCarousel() {
  const viewport = document.querySelector('[data-premium-reviews-viewport]');
  if (!viewport) {
    return;
  }

  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let rafId = 0;
  let isPaused = false;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartScrollLeft = 0;
  let totalLoopWidth = 0;
  let lastTimestamp = 0;

  const measureLoopWidth = () => {
    totalLoopWidth = Math.max(0, Math.floor(viewport.scrollWidth / 2));
    if (totalLoopWidth > 0 && viewport.scrollLeft === 0) {
      viewport.scrollLeft = totalLoopWidth;
    }
  };

  const step = (timestamp) => {
    if (!lastTimestamp) {
      lastTimestamp = timestamp;
    }

    const dt = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    if (!prefersReducedMotion && !isPaused && !isDragging && totalLoopWidth > 0) {
      const speedPxPerMs = 0.022; // smoother premium drift
      viewport.scrollLeft -= dt * speedPxPerMs;

      if (viewport.scrollLeft <= 0) {
        viewport.scrollLeft += totalLoopWidth;
      } else if (viewport.scrollLeft >= totalLoopWidth) {
        viewport.scrollLeft -= totalLoopWidth;
      }
    }

    rafId = window.requestAnimationFrame(step);
  };

  const pause = () => {
    isPaused = true;
  };

  const resume = () => {
    if (!isDragging) {
      isPaused = false;
    }
  };

  viewport.addEventListener('mouseenter', pause);
  viewport.addEventListener('mouseleave', resume);
  viewport.addEventListener('focusin', pause);
  viewport.addEventListener('focusout', resume);
  viewport.addEventListener('wheel', pause, { passive: true });

  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }

    isDragging = true;
    isPaused = true;
    dragStartX = event.clientX;
    dragStartScrollLeft = viewport.scrollLeft;
    viewport.classList.add('is-dragging');
    viewport.style.scrollBehavior = 'auto';

    try {
      viewport.setPointerCapture(event.pointerId);
    } catch (error) {
      // Some browsers/platforms may not support pointer capture for this element.
    }
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!isDragging) {
      return;
    }

    const delta = event.clientX - dragStartX;
    viewport.scrollLeft = dragStartScrollLeft - delta;

    if (totalLoopWidth > 0) {
      if (viewport.scrollLeft <= 0) {
        viewport.scrollLeft += totalLoopWidth;
        dragStartScrollLeft += totalLoopWidth;
      } else if (viewport.scrollLeft >= totalLoopWidth) {
        viewport.scrollLeft -= totalLoopWidth;
        dragStartScrollLeft -= totalLoopWidth;
      }
    }
  });

  const endDrag = () => {
    if (!isDragging) {
      return;
    }

    isDragging = false;
    viewport.classList.remove('is-dragging');
    isPaused = false;
  };

  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('lostpointercapture', endDrag);
  viewport.addEventListener('dragstart', (event) => event.preventDefault());

  const init = () => {
    measureLoopWidth();

    if (totalLoopWidth > 0) {
      viewport.scrollLeft = totalLoopWidth;
    }

    if (!rafId) {
      rafId = window.requestAnimationFrame(step);
    }
  };

  window.addEventListener('resize', measureLoopWidth, { passive: true });

  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init, { once: true });
  }
}


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPremiumCursor);
} else {
  initPremiumCursor();
}




function initScrollReveal() {
  const selectors = [
    '.component',
    '.reveal-on-scroll',
    '.premium-product-card',
    '.premium-feature-card',
    '.premium-review-card',
    '.premium-faq-item',
    '.premium-stats-section',
    '.premium-stats-grid',
    '.premium-stat-card',
    '.category-link',
    '.premium-payment-method',
    '.premium-card',
    '.product-card',
    'nav',
    'footer',
    '.announcement',
    'header',
    'section',
    'article'
  ];

  const revealElements = [];
  const seen = new Set();
  let observer = null;

  const registerElement = (element) => {
    if (!element || seen.has(element)) {
      return;
    }

    seen.add(element);
    element.classList.add('reveal-on-scroll');

    if (!element.style.getPropertyValue('--reveal-delay')) {
      element.style.setProperty('--reveal-delay', `${Math.min(revealElements.length * 70, 700)}ms`);
    }

    revealElements.push(element);

    if (observer) {
      observer.observe(element);
    }
  };

  const registerChildren = (container) => {
    if (!container || !container.children || !container.children.length) {
      return;
    }

    Array.from(container.children).forEach((child, index) => {
      if (!child || seen.has(child) || child.matches?.('script, style, template')) {
        return;
      }

      seen.add(child);
      child.classList.add('reveal-on-scroll');

      if (!child.style.getPropertyValue('--reveal-delay')) {
        child.style.setProperty('--reveal-delay', `${Math.min(index * 90, 720)}ms`);
      }

      revealElements.push(child);

      if (observer) {
        observer.observe(child);
      }
    });
  };

  const scanRoot = (root = document) => {
    selectors.forEach((selector) => {
      if (typeof root.matches === 'function' && root.matches(selector)) {
        registerElement(root);

        if (root.classList?.contains('component') || root.matches('nav, footer, .announcement, header')) {
          registerChildren(root);
        }
      }

      if (typeof root.querySelectorAll === 'function') {
        root.querySelectorAll(selector).forEach((element) => {
          registerElement(element);

          if (element.classList?.contains('component') || element.matches('nav, footer, .announcement, header')) {
            registerChildren(element);
          }
        });
      }
    });
  };

  scanRoot();

  if (!revealElements.length) {
    return;
  }

  const reveal = (element) => element.classList.add('is-visible');

  if (!('IntersectionObserver' in window)) {
    revealElements.forEach(reveal);
    return;
  }

  observer = new IntersectionObserver((entries, io) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        window.setTimeout(() => {
          entry.target.classList.add('is-visible');
        }, 24);
        io.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -5% 0px'
  });

  revealElements.forEach((element) => observer.observe(element));

  if ('MutationObserver' in window) {
    const mutationObserver = new MutationObserver((mutations) => {
      let hasNewTargets = false;

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) {
            return;
          }

          const before = revealElements.length;
          scanRoot(node);
          if (revealElements.length > before) {
            hasNewTargets = true;
          }
        });
      });

      if (hasNewTargets) {
        // Newly added nodes are observed inside registerElement().
      }
    });

    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
}



if (document.readyState === 'loading') {

  document.addEventListener('DOMContentLoaded', initPremiumReviewsCarousel);
} else {
  initPremiumReviewsCarousel();
}


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initScrollReveal);
} else {
  initScrollReveal();
}



function initPremiumStatCounters() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const counters = document.querySelectorAll('.premium-stat-card [data-count]');

  if (!counters.length) {
    return;
  }

  const formatValue = (value, decimals, suffix) => {
    const rounded = Number(value).toFixed(decimals);
    return `${rounded}${suffix || ''}`;
  };

  const animateCounter = (element) => {
    if (element.dataset.countAnimated === 'true') {
      return;
    }

    element.dataset.countAnimated = 'true';

    const target = Number(element.dataset.count || 0);
    const decimals = Number(element.dataset.decimals || 0);
    const suffix = element.dataset.suffix || '';
    const duration = 1300;
    const start = performance.now();

    if (prefersReducedMotion || !Number.isFinite(target)) {
      element.textContent = formatValue(target, decimals, suffix);
      return;
    }

    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;

      element.textContent = formatValue(current, decimals, suffix);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        element.textContent = formatValue(target, decimals, suffix);
      }
    };

    requestAnimationFrame(step);
  };

  if (!('IntersectionObserver' in window)) {
    counters.forEach(animateCounter);
    return;
  }

  const counterObserver = new IntersectionObserver((entries, io) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        io.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.6,
    rootMargin: '0px 0px -8% 0px'
  });

  counters.forEach((element) => counterObserver.observe(element));
}


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPremiumStatCounters);
} else {
  initPremiumStatCounters();
}


// Galactic theme enhancements: lightweight ambient stars, nebula shimmer, and
// subtle card glow without the old glitch flicker or blur-heavy effects.
function initUltimateGalaxyEverywhere() {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const scan = (root = document) => {
    const addClass = (selector, className) => {
      const elements = [];
      if (root.matches?.(selector)) elements.push(root);
      root.querySelectorAll?.(selector).forEach((item) => elements.push(item));
      elements.forEach((element) => element.classList.add(className));
    };

    addClass('.premium-product-card, .premium-feature-card, .premium-review-card, .premium-faq-item, .premium-stat-card, .premium-card, .product-card, .category-panel, .premium-reviews-shell, .bg-card, [class*="bg-card"], article, form, .modal, [role="dialog"] > div', 'galaxy-surface');
    addClass('a[href], button, [role="button"], .category-link, .premium-faq-question, .choices__item--choice, .choices__button, .currency-selector button, input[type="submit"]', 'galaxy-interactive');
    addClass('h1, h2, h3, .premium-section-title, .premium-stat-card__value, .text-accent-500, .text-accent-400, nav a, footer a', 'galaxy-text');
    addClass('svg, i, [class*="icon"], img', 'galaxy-media');
  };

  scan();

  if (!prefersReducedMotion) {
    window.setInterval(() => {
      const surfaces = Array.from(document.querySelectorAll('.galaxy-surface, .galaxy-interactive'));
      if (!surfaces.length) return;
      const target = surfaces[Math.floor(Math.random() * surfaces.length)];
      target.classList.add('is-galaxy-pulse');
      window.setTimeout(() => target.classList.remove('is-galaxy-pulse'), 720);
    }, 18000);
  }

  if ('MutationObserver' in window) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) scan(node);
        });
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUltimateGalaxyEverywhere);
} else {
  initUltimateGalaxyEverywhere();
}


document.addEventListener('DOMContentLoaded',()=>{
 // Reliable premium currency selector fallback for the native select.
 document.querySelectorAll('[data-currency-select]').forEach(sel=>{
   sel.addEventListener('change',e=>{
      const value = (e.target.value || '').toLowerCase();
      if (window.alpineApp?.appCurrency?.setCurrency) {
        window.alpineApp.appCurrency.setCurrency(value);
      } else {
        localStorage.setItem('currency', value);
        document.querySelectorAll('[data-currency-current]').forEach(el => { el.textContent = value.toUpperCase(); });
        document.querySelectorAll('[data-currency-symbol]').forEach(el => { el.textContent = window.currencySymbols?.[value] || '$'; });
      }
   });
 });

 // auto moving reviews
 const track=document.querySelector('[data-premium-reviews-track]');
 if(track){
   let pos=0;
   setInterval(()=>{
      pos += 1;
      track.style.transform='translateX(-'+pos+'px)';
      if(pos>track.scrollWidth/2){pos=0;}
   },90);
 }
});

// Scroll-reactive galactic core: the center galaxy subtly drifts and rotates as the page scrolls.
(function initGalacticScrollCore() {
  const root = document.documentElement;
  const core = () => document.getElementById('galaxy-scroll-core');
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    root.style.setProperty('--galaxy-core-y', '0px');
    root.style.setProperty('--galaxy-core-rotate', '0deg');
    root.style.setProperty('--galaxy-core-scale', '1');
    return;
  }

  let ticking = false;

  const update = () => {
    ticking = false;
    if (!core()) return;

    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / scrollable));
    const drift = Math.round((progress - 0.5) * 150);
    const rotate = Math.round(progress * 96);
    const scale = (1 + progress * 0.07).toFixed(3);

    root.style.setProperty('--galaxy-core-y', `${drift}px`);
    root.style.setProperty('--galaxy-core-rotate', `${rotate}deg`);
    root.style.setProperty('--galaxy-core-scale', scale);
  };

  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', update, { once: true });
  } else {
    update();
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });
})();

// Void Galactic V4 polish: scroll-reactive effects and custom currency active state.
(function initVoidGalacticV4() {
  const root = document.documentElement;
  let ticking = false;
  const updateScroll = () => {
    ticking = false;
    root.style.setProperty('--void-scroll', String(Math.round(window.scrollY || 0)) + 'px');
  };
  const request = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateScroll);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateScroll, { once: true });
  } else {
    updateScroll();
  }
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request, { passive: true });

  const syncCurrencyButtons = (currency) => {
    const normalized = String(currency || window.alpineApp?.appCurrency?.currency || window.defaultCurrency || 'usd').toLowerCase();
    document.querySelectorAll('[data-currency-option]').forEach((button) => {
      const active = button.dataset.currencyOption === normalized;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  };

  document.addEventListener('DOMContentLoaded', () => syncCurrencyButtons());
  window.addEventListener('currency:changed', (event) => syncCurrencyButtons(event.detail?.currency));
  document.addEventListener('click', (event) => {
    const option = event.target.closest?.('[data-currency-option]');
    if (option) syncCurrencyButtons(option.dataset.currencyOption);
  });
})();





/* === VOID GALACTIC CURRENCY SELECTOR V6 — REAL SELECTING + NO LAG === */
(function voidGalacticCurrencySelectorV6() {
  const ready = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };

  const normalize = (value) => String(value || '').trim().toLowerCase();

  const normalizeGlobals = () => {
    window.currencyRatesUsd = Object.fromEntries(
      Object.entries(window.currencyRatesUsd || {}).map(([key, value]) => [normalize(key), value])
    );

    const symbols = window.currencySymbols || {};
    window.currencySymbols = Object.fromEntries(
      Object.entries(symbols).flatMap(([key, value]) => [[normalize(key), value], [String(key).toUpperCase(), value]])
    );

    if (window.alpineApp?.appCurrency) {
      window.alpineApp.appCurrency.ratesUsd = Object.fromEntries(
        Object.entries(window.alpineApp.appCurrency.ratesUsd || window.currencyRatesUsd || {}).map(([key, value]) => [normalize(key), value])
      );
    }
  };

  const isValid = (code) => {
    normalizeGlobals();
    return !!(code && window.currencyRatesUsd && window.currencyRatesUsd[normalize(code)]);
  };

  const symbolFor = (code) => {
    const normalized = normalize(code);
    return window.currencySymbols?.[normalized] || window.currencySymbols?.[normalized.toUpperCase()] || '$';
  };

  const setMenuOpen = (root, open) => {
    if (!root) return;
    const trigger = root.querySelector('[data-void-currency-trigger]');
    const menu = root.querySelector('[data-void-currency-menu]');
    root.classList.toggle('is-open', !!open);
    if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (menu) {
      menu.hidden = !open;
      menu.setAttribute('aria-hidden', open ? 'false' : 'true');
      menu.style.pointerEvents = open ? 'auto' : 'none';
    }
  };

  const closeAll = (except = null) => {
    document.querySelectorAll('[data-void-currency-selector]').forEach((root) => {
      if (except && root === except) return;
      setMenuOpen(root, false);
    });
  };

  const syncUi = (code) => {
    const selected = normalize(code || window.alpineApp?.appCurrency?.currency || localStorage.getItem('currency') || window.defaultCurrency || 'usd');
    if (!selected) return;

    document.querySelectorAll('[data-currency-current]').forEach((el) => { el.textContent = selected.toUpperCase(); });
    document.querySelectorAll('[data-currency-symbol]').forEach((el) => { el.textContent = symbolFor(selected); });
    document.querySelectorAll('[data-currency-select]').forEach((el) => {
      try { el.value = selected; } catch (_) {}
    });
    document.querySelectorAll('[data-currency-option]').forEach((el) => {
      const active = normalize(el.getAttribute('data-currency-option')) === selected;
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  };

  window.__voidSetCurrency = function __voidSetCurrency(code, event) {
    if (event) {
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
    }

    normalizeGlobals();
    const selected = normalize(code);
    if (!isValid(selected)) return false;

    localStorage.setItem('currency', selected);

    let appHandled = false;
    try {
      if (window.alpineApp?.appCurrency?.setCurrency) {
        appHandled = window.alpineApp.appCurrency.setCurrency(selected) !== false;
      }
    } catch (err) {
      console.warn('Void currency update used fallback:', err);
    }

    if (!appHandled && window.alpineApp?.appCurrency) {
      window.alpineApp.appCurrency.currency = selected;
    }

    syncUi(selected);
    window.dispatchEvent(new CustomEvent('currency:changed', { detail: { currency: selected } }));
    closeAll();
    return false;
  };

  ready(() => {
    normalizeGlobals();
    syncUi(localStorage.getItem('currency') || window.defaultCurrency || 'usd');

    document.querySelectorAll('[data-void-currency-selector]').forEach((root) => {
      if (root.dataset.voidCurrencyV6 === 'true') return;
      root.dataset.voidCurrencyV6 = 'true';
      setMenuOpen(root, false);

      const trigger = root.querySelector('[data-void-currency-trigger]');
      const menu = root.querySelector('[data-void-currency-menu]');

      if (trigger) {
        trigger.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const open = !root.classList.contains('is-open');
          closeAll(root);
          setMenuOpen(root, open);
        }, true);

        trigger.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
            event.preventDefault();
            closeAll(root);
            setMenuOpen(root, true);
            const first = menu?.querySelector('.is-active, [data-currency-option]');
            first?.focus?.();
          }
        });
      }

      if (menu) {
        menu.addEventListener('pointerdown', (event) => {
          const option = event.target.closest?.('[data-currency-option]');
          if (!option) return;
          window.__voidSetCurrency(option.getAttribute('data-currency-option'), event);
        }, true);

        menu.addEventListener('click', (event) => {
          const option = event.target.closest?.('[data-currency-option]');
          if (!option) return;
          window.__voidSetCurrency(option.getAttribute('data-currency-option'), event);
        }, true);

        menu.addEventListener('keydown', (event) => {
          const options = Array.from(menu.querySelectorAll('[data-currency-option]'));
          const index = options.indexOf(document.activeElement);
          if (event.key === 'Escape') {
            event.preventDefault();
            setMenuOpen(root, false);
            trigger?.focus?.();
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            (options[index + 1] || options[0])?.focus?.();
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            (options[index - 1] || options[options.length - 1])?.focus?.();
          } else if (event.key === 'Enter' || event.key === ' ') {
            const option = document.activeElement?.closest?.('[data-currency-option]');
            if (option) window.__voidSetCurrency(option.getAttribute('data-currency-option'), event);
          }
        });
      }
    });

    document.addEventListener('pointerdown', (event) => {
      const option = event.target.closest?.('[data-currency-option]');
      if (option) {
        window.__voidSetCurrency(option.getAttribute('data-currency-option'), event);
        return;
      }
      if (!event.target.closest?.('[data-void-currency-selector]')) closeAll();
    }, true);

    document.addEventListener('change', (event) => {
      const select = event.target.closest?.('[data-currency-select]');
      if (!select) return;
      window.__voidSetCurrency(select.value, event);
    }, true);

    window.addEventListener('currency:changed', (event) => syncUi(event.detail?.currency));
    document.addEventListener('alpine:initialized', () => {
      normalizeGlobals();
      syncUi(localStorage.getItem('currency') || window.alpineApp?.appCurrency?.currency || window.defaultCurrency || 'usd');
    });
  });
})();


/* HARD CURRENCY NATIVE SELECT PATCH — reliable browser/device selection */
(function hardCurrencyNativeSelectPatch(){
  const norm = (v) => String(v || '').trim().toLowerCase();
  const getSymbol = (code) => window.currencySymbols?.[norm(code)] || window.currencySymbols?.[String(code || '').toUpperCase()] || '$';
  const sync = (code) => {
    const c = norm(code || window.alpineApp?.appCurrency?.currency || localStorage.getItem('currency') || window.defaultCurrency || 'usd');
    if (!c) return;
    document.querySelectorAll('[data-currency-current]').forEach((el) => { el.textContent = c.toUpperCase(); });
    document.querySelectorAll('[data-currency-symbol]').forEach((el) => { el.textContent = getSymbol(c); });
    document.querySelectorAll('[data-currency-select]').forEach((sel) => { if (sel.value !== c) sel.value = c; });
  };
  const set = (code) => {
    const c = norm(code);
    if (!c) return;
    try { localStorage.setItem('currency', c); } catch (_) {}
    try {
      if (window.alpineApp?.appCurrency?.setCurrency) {
        window.alpineApp.appCurrency.setCurrency(c);
      } else if (window.alpineApp?.appCurrency) {
        window.alpineApp.appCurrency.currency = c;
      }
    } catch (err) { console.warn('Currency native set fallback used:', err); }
    sync(c);
    try { window.dispatchEvent(new CustomEvent('currency:changed', { detail: { currency: c } })); } catch (_) {}
  };
  const bind = () => {
    sync(localStorage.getItem('currency') || window.alpineApp?.appCurrency?.currency || window.defaultCurrency || 'usd');
    document.querySelectorAll('.void-native-money-selector__select[data-currency-select]').forEach((sel) => {
      if (sel.dataset.nativeCurrencyBound === 'true') return;
      sel.dataset.nativeCurrencyBound = 'true';
      sel.addEventListener('change', () => set(sel.value), false);
      sel.addEventListener('input', () => set(sel.value), false);
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
  document.addEventListener('alpine:initialized', bind);
  window.addEventListener('currency:changed', (event) => sync(event.detail?.currency));
})();
