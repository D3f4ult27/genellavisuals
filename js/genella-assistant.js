(function () {
  'use strict';

  var CONFIG = {
    knowledgeUrl: 'data/assistant-knowledge.json',
    storageKey: 'gv_ai_conversation_v1',
    leadKey: 'gv_ai_leads_v1',
    analyticsKey: 'gv_ai_analytics_v1',
    maxMessages: 80,
    whatsapp: 'https://wa.me/255652240291',
    email: 'visuals@genella.co.tz',
    phone: '+255652240291'
  };

  var state = {
    open: false,
    knowledge: null,
    messages: [],
    pendingFiles: [],
    lastSentAt: 0,
    profile: {
      language: 'en',
      name: '',
      business: '',
      service: '',
      budget: '',
      timeline: '',
      phone: '',
      email: ''
    }
  };

  var intents = [
    { id: 'booking', words: ['book', 'booking', 'appointment', 'schedule', 'reserve', 'consultation', 'weka booking', 'nahitaji appointment'] },
    { id: 'pricing', words: ['price', 'pricing', 'cost', 'package', 'packages', 'bei', 'gharama', 'kiasi', 'budget'] },
    { id: 'website', words: ['website', 'web', 'landing page', 'ecommerce', 'site', 'tovuti'] },
    { id: 'branding', words: ['brand', 'branding', 'logo', 'identity', 'slogan', 'tagline', 'nembo'] },
    { id: 'photo', words: ['photo', 'photography', 'shoot', 'photoshoot', 'portrait', 'wedding', 'picha', 'harusi'] },
    { id: 'video', words: ['video', 'videography', 'film', 'reel', 'drone', 'cinematic', 'editing', 'filamu'] },
    { id: 'support', words: ['support', 'help', 'problem', 'issue', 'complaint', 'msaada'] },
    { id: 'portfolio', words: ['portfolio', 'gallery', 'work', 'examples', 'sample', 'kazi'] }
  ];

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'class') node.className = attrs[key];
      else if (key === 'text') node.textContent = attrs[key];
      else if (key === 'html') node.innerHTML = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) {
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function safeJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function save() {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify({
      messages: state.messages.slice(-CONFIG.maxMessages),
      profile: state.profile
    }));
  }

  function analytics(event, detail) {
    var data = safeJson(CONFIG.analyticsKey, []);
    data.push({
      event: event,
      detail: detail || {},
      language: state.profile.language,
      at: new Date().toISOString()
    });
    localStorage.setItem(CONFIG.analyticsKey, JSON.stringify(data.slice(-500)));
  }

  function detectLanguage(text) {
    var lower = text.toLowerCase();
    var sw = ['habari', 'nina', 'nataka', 'nahitaji', 'bei', 'gharama', 'harusi', 'picha', 'tovuti', 'tafadhali', 'asante', 'msaada', 'kampuni', 'biashara'];
    var score = sw.reduce(function (count, word) {
      return count + (lower.indexOf(word) !== -1 ? 1 : 0);
    }, 0);
    if (score > 0) return 'sw';
    return 'en';
  }

  function sanitize(text) {
    return String(text || '').replace(/[<>]/g, function (char) {
      return char === '<' ? '&lt;' : '&gt;';
    });
  }

  function markdown(text) {
    var html = sanitize(text)
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(.*?)\]\((https?:\/\/.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\n- /g, '<br>• ')
      .replace(/\n/g, '<br>');
    return html;
  }

  function tokenize(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9\u00c0-\u017f]+/g, ' ').split(/\s+/).filter(function (word) {
      return word.length > 2;
    });
  }

  function scoreDoc(queryTokens, doc) {
    var text = (doc.title + ' ' + doc.description + ' ' + doc.text).toLowerCase();
    return queryTokens.reduce(function (score, token) {
      if (text.indexOf(token) === -1) return score;
      var titleBoost = doc.title.toLowerCase().indexOf(token) !== -1 ? 3 : 0;
      return score + 1 + titleBoost;
    }, 0);
  }

  function retrieve(query, limit) {
    if (!state.knowledge || !state.knowledge.documents) return [];
    var tokens = tokenize(query);
    if (!tokens.length) return [];
    return state.knowledge.documents
      .map(function (doc) {
        return { doc: doc, score: scoreDoc(tokens, doc) };
      })
      .filter(function (item) {
        return item.score > 0;
      })
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .slice(0, limit || 4)
      .map(function (item) {
        return item.doc;
      });
  }

  function classifyIntent(text) {
    var lower = text.toLowerCase();
    var best = { id: 'general', score: 0 };
    intents.forEach(function (intent) {
      var score = intent.words.reduce(function (total, word) {
        return total + (lower.indexOf(word) !== -1 ? 1 : 0);
      }, 0);
      if (score > best.score) best = { id: intent.id, score: score };
    });
    return best.id;
  }

  function updateProfile(text, intent) {
    var email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    var phone = text.match(/(?:\+?255|0)?\s?\d{3}\s?\d{3}\s?\d{3}/);
    var budget = text.match(/(?:tzs|tsh|usd|\$)?\s?[\d,.]{5,}/i);
    if (email) state.profile.email = email[0];
    if (phone) state.profile.phone = phone[0];
    if (budget) state.profile.budget = budget[0];
    if (intent !== 'general') state.profile.service = intent;
  }

  function nowTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function pushMessage(role, content, meta) {
    var message = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      role: role,
      content: content,
      meta: meta || {},
      at: new Date().toISOString()
    };
    state.messages.push(message);
    state.messages = state.messages.slice(-CONFIG.maxMessages);
    save();
    renderMessage(message);
    scrollBottom();
    return message;
  }

  function addSources(container, sources) {
    if (!sources || !sources.length) return;
    var wrap = el('div', { class: 'gv-ai-sources' });
    sources.slice(0, 3).forEach(function (source) {
      wrap.appendChild(el('a', {
        class: 'gv-ai-source',
        href: source.url,
        text: source.title.replace(/^(.{34}).+$/, '$1...'),
        target: '_self'
      }));
    });
    container.appendChild(wrap);
  }

  function renderMessage(message) {
    var list = $('.gv-ai-messages');
    if (!list) return;
    var row = el('div', { class: 'gv-ai-row is-' + message.role });
    var bubble = el('div', { class: 'gv-ai-bubble', html: markdown(message.content) });
    addSources(bubble, message.meta.sources);
    if (message.meta.actions) addActions(bubble, message.meta.actions);
    if (message.meta.booking) bubble.appendChild(bookingForm());
    bubble.appendChild(el('div', {
      class: 'gv-ai-meta',
      text: nowTimeFrom(message.at) + (message.role === 'user' ? ' · Delivered · Seen' : '')
    }));
    row.appendChild(bubble);
    list.appendChild(row);
  }

  function nowTimeFrom(date) {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function addActions(root, actions) {
    var wrap = el('div', { class: 'gv-ai-actions' });
    actions.forEach(function (action) {
      if (action.href) {
        wrap.appendChild(el('a', {
          class: 'gv-ai-action',
          href: action.href,
          target: action.target || '_self',
          rel: 'noopener noreferrer',
          text: action.label
        }));
      } else {
        var button = el('button', { class: 'gv-ai-chip', type: 'button', text: action.label });
        button.addEventListener('click', function () {
          handleUser(action.prompt || action.label);
        });
        wrap.appendChild(button);
      }
    });
    root.appendChild(wrap);
  }

  function scrollBottom() {
    var list = $('.gv-ai-messages');
    if (list) list.scrollTop = list.scrollHeight;
  }

  function typing(show) {
    var list = $('.gv-ai-messages');
    var existing = $('.gv-ai-row.is-typing');
    if (existing) existing.remove();
    if (!show || !list) return;
    var row = el('div', { class: 'gv-ai-row is-assistant is-typing' });
    row.appendChild(el('div', { class: 'gv-ai-bubble' }, [
      el('span', { class: 'gv-ai-typing' }, [el('span'), el('span'), el('span')])
    ]));
    list.appendChild(row);
    scrollBottom();
  }

  function packageSummary(language) {
    if (language === 'sw') {
      return 'Kwa picha za outdoor, Standard ni TZS 100,000 na Premium ni TZS 250,000. Kwa harusi, Silver ni TZS 900,000, Gold ni TZS 1,500,000, na Diamond ni TZS 2,000,000.';
    }
    return 'Outdoor sessions start with Standard at TZS 100,000 and Premium at TZS 250,000. Wedding packages are Silver at TZS 900,000, Gold at TZS 1,500,000, and Diamond at TZS 2,000,000.';
  }

  function serviceRecommendation(intent, language) {
    var sw = language === 'sw';
    var map = {
      website: sw
        ? 'Kwa website, ningependekeza pia brand photography, copy ya kurasa muhimu, Google Business optimization, social media launch content, na brand identity ndogo kama logo au color system.'
        : 'For a website project, I would pair the site with brand photography, core page copy, Google Business optimization, launch social content, and a light brand identity refresh if your logo or colors need tightening.',
      branding: sw
        ? 'Kwa branding, tuanze na logo/identity direction, kisha tuunganishe photography, templates za social media, tagline, na brand guide ili muonekano uwe consistent.'
        : 'For branding, I would start with identity direction, then connect it to photography, social templates, tagline work, and a compact brand guide so the whole presence feels consistent.',
      photo: sw
        ? 'Kwa photoshoot, chaguo bora hutegemea matumizi: personal branding, event, product, au harusi. Premium package inafaa kama unahitaji reel fupi na picha nyingi zaidi.'
        : 'For photography, the best package depends on use: personal branding, event, product, or wedding. Premium is the stronger fit when you need more edited images and a short reel.',
      video: sw
        ? 'Kwa video, fikiria highlight reel, documentary coverage, drone kama location inaruhusu, color grading, na short clips za Instagram/Facebook.'
        : 'For video, I would plan around a highlight reel, documentary coverage, drone where permitted, color grading, and short social clips for Instagram and Facebook.'
    };
    return map[intent] || (sw
      ? 'Naweza kukusaidia kuchagua huduma sahihi, kulinganisha packages, au kuandaa booking kwa consultant.'
      : 'I can help you choose the right service, compare packages, or prepare a booking for a consultant.');
  }

  function missingLeadQuestions(language) {
    var sw = language === 'sw';
    var asks = [];
    if (!state.profile.business) asks.push(sw ? 'jina la biashara au event' : 'business or event name');
    if (!state.profile.budget) asks.push(sw ? 'budget unayofikiria' : 'estimated budget');
    if (!state.profile.timeline) asks.push(sw ? 'tarehe au timeline' : 'date or timeline');
    if (!state.profile.phone && !state.profile.email) asks.push(sw ? 'njia bora ya kukupata' : 'best contact method');
    return asks.slice(0, 2);
  }

  function composeAnswer(text, intent, docs, language) {
    var sw = language === 'sw';
    var response = '';
    var context = docs.map(function (doc) { return doc.text; }).join(' ').slice(0, 900);

    if (intent === 'pricing') {
      response = packageSummary(language) + (sw
        ? '\n\nKama unaniambia aina ya tukio, tarehe, location na deliverables unazotaka, nitakupendekezea package inayofaa zaidi.'
        : '\n\nIf you share the event type, date, location, and deliverables you want, I can recommend the most suitable package.');
    } else if (intent === 'booking') {
      response = sw
        ? 'Ndio, naweza kukuandalia booking. Niambie jina, huduma unayotaka, tarehe/time unayopendelea, location, budget, na namba au email. Unaweza pia kutumia form hapa chini.'
        : 'Absolutely. I can prepare the booking details here. Share your name, service, preferred date/time, location, budget, and phone or email. You can also use the form below.';
    } else if (intent === 'support') {
      response = sw
        ? 'Niko hapa kusaidia. Ukiniambia issue yako kwa kifupi, nitaangalia kama naweza kuitatua hapa au nikuunganishe na consultant kupitia WhatsApp/email bila kurudia maelezo.'
        : 'I can help with that. Tell me what happened and I will either solve it here or package the conversation for a consultant on WhatsApp or email so you do not have to repeat yourself.';
    } else if (intent === 'portfolio') {
      response = sw
        ? 'Unaweza kuona kazi kwenye Portfolio na Gallery. Kama una aina ya project unayofikiria, nitakuelekeza kwenye style inayokaribiana na mahitaji yako.'
        : 'You can view work in the Portfolio and Gallery. If you describe the project style you have in mind, I can point you toward the closest category and recommend a matching package.';
    } else {
      response = serviceRecommendation(intent, language);
      if (context) {
        response += sw
          ? '\n\nKutokana na taarifa za website, GENELLA Visuals hufanya photography, cinematic videography, post-production, branding shoots, social media content, weddings, corporate events, portraits, na custom packages.'
          : '\n\nBased on the website, GENELLA Visuals covers photography, cinematic videography, post-production, branding shoots, social media content, weddings, corporate events, portraits, and custom packages.';
      }
    }

    var questions = missingLeadQuestions(language);
    if (questions.length) {
      response += sw
        ? '\n\nIli nikushauri vizuri, niambie ' + questions.join(' na ') + '.'
        : '\n\nTo guide you properly, tell me your ' + questions.join(' and ') + '.';
    }

    return response;
  }

  function actionsFor(intent, language) {
    var sw = language === 'sw';
    var actions = [
      { label: sw ? 'WhatsApp' : 'WhatsApp', href: CONFIG.whatsapp, target: '_blank' },
      { label: sw ? 'Bei' : 'Pricing', href: './pricing.html' },
      { label: sw ? 'Portfolio' : 'Portfolio', href: './portfolio.html' }
    ];
    if (intent === 'booking') {
      actions.unshift({ label: sw ? 'Fungua Booking' : 'Open Booking Form', prompt: sw ? 'Nataka kufanya booking' : 'I want to make a booking' });
    }
    return actions;
  }

  function suggestedChips(language) {
    var chips = language === 'sw'
      ? ['Nahitaji bei', 'Book photoshoot', 'Harusi package gani?', 'Nahitaji logo', 'Ongea na expert']
      : ['Build my website', 'Photography prices', 'Book consultation', 'Need logo', 'View packages'];
    var wrap = el('div', { class: 'gv-ai-chips' });
    chips.forEach(function (chip) {
      var button = el('button', { class: 'gv-ai-chip', type: 'button', text: chip });
      button.addEventListener('click', function () { handleUser(chip); });
      wrap.appendChild(button);
    });
    return wrap;
  }

  function handleUser(text) {
    var value = String(text || '').trim();
    if (!value) return;
    var now = Date.now();
    if (now - state.lastSentAt < 700) return;
    state.lastSentAt = now;

    state.profile.language = detectLanguage(value);
    var intent = classifyIntent(value);
    updateProfile(value, intent);
    pushMessage('user', value + fileSummary(), { intent: intent });
    analytics('message', { role: 'user', intent: intent });
    clearInput();

    typing(true);
    window.setTimeout(function () {
      typing(false);
      var docs = retrieve(value, 4);
      var answer = composeAnswer(value, intent, docs, state.profile.language);
      pushMessage('assistant', answer, {
        intent: intent,
        sources: docs,
        actions: actionsFor(intent, state.profile.language),
        booking: intent === 'booking'
      });
      analytics('message', { role: 'assistant', intent: intent, sources: docs.length });
      state.pendingFiles = [];
      renderFilePreview();
    }, Math.min(1150, 420 + value.length * 8));
  }

  function fileSummary() {
    if (!state.pendingFiles.length) return '';
    return '\n\nAttached files: ' + state.pendingFiles.map(function (file) {
      return file.name + ' (' + file.type + ')';
    }).join(', ');
  }

  function clearInput() {
    var input = $('.gv-ai-input');
    if (input) {
      input.value = '';
      input.style.height = '';
    }
  }

  function bookingForm() {
    var form = el('form', { class: 'gv-ai-booking' });
    [
      ['name', 'Your name'],
      ['email', 'Email address'],
      ['phone', 'Phone / WhatsApp'],
      ['service', 'Service or package'],
      ['date', 'Preferred date'],
      ['time', 'Preferred time'],
      ['budget', 'Budget']
    ].forEach(function (field) {
      form.appendChild(el('input', { name: field[0], placeholder: field[1], value: state.profile[field[0]] || '' }));
    });
    form.appendChild(el('textarea', { name: 'description', placeholder: 'Brief project details, goals, location, audience or deliverables' }));
    form.appendChild(el('button', { type: 'submit', text: 'Save booking and continue' }));
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var data = {};
      Array.prototype.slice.call(new FormData(form).entries()).forEach(function (entry) {
        data[entry[0]] = entry[1];
      });
      data.createdAt = new Date().toISOString();
      data.transcript = state.messages.slice(-20);
      var leads = safeJson(CONFIG.leadKey, []);
      leads.push(data);
      localStorage.setItem(CONFIG.leadKey, JSON.stringify(leads));
      analytics('booking', { service: data.service, budget: data.budget });
      var summary = encodeURIComponent('Hello GENELLA Visuals,\n\nI would like to book a service.\n\nName: ' + (data.name || '') + '\nEmail: ' + (data.email || '') + '\nPhone: ' + (data.phone || '') + '\nService: ' + (data.service || '') + '\nPreferred date/time: ' + (data.date || '') + ' ' + (data.time || '') + '\nBudget: ' + (data.budget || '') + '\nDetails: ' + (data.description || ''));
      pushMessage('assistant', 'Perfect. I have saved the booking details in this browser and prepared a WhatsApp handoff so the GENELLA Visuals team can confirm availability and deposit next steps.', {
        actions: [
          { label: 'Send on WhatsApp', href: CONFIG.whatsapp + '?text=' + summary, target: '_blank' },
          { label: 'Email transcript', href: emailTranscriptHref(), target: '_blank' }
        ]
      });
    });
    return form;
  }

  function emailTranscriptHref() {
    var body = state.messages.map(function (message) {
      return message.role.toUpperCase() + ': ' + message.content;
    }).join('\n\n');
    return 'mailto:' + CONFIG.email + '?subject=' + encodeURIComponent('GENELLA Visuals chat transcript') + '&body=' + encodeURIComponent(body.slice(-7000));
  }

  function exportTranscript() {
    var content = state.messages.map(function (message) {
      return '[' + new Date(message.at).toLocaleString() + '] ' + message.role.toUpperCase() + '\n' + message.content;
    }).join('\n\n');
    var blob = new Blob([content], { type: 'text/plain' });
    var link = el('a', { href: URL.createObjectURL(blob), download: 'genella-visuals-chat.txt' });
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function clearHistory() {
    state.messages = [];
    localStorage.removeItem(CONFIG.storageKey);
    $('.gv-ai-messages').innerHTML = '';
    welcome();
    analytics('clear_history');
  }

  function renderFilePreview() {
    var preview = $('.gv-ai-upload-preview');
    if (!preview) return;
    preview.innerHTML = '';
    preview.classList.toggle('is-visible', state.pendingFiles.length > 0);
    state.pendingFiles.forEach(function (file) {
      preview.appendChild(el('span', { class: 'gv-ai-file-pill', text: file.name }));
    });
  }

  function buildWidget() {
    var widget = el('section', { class: 'gv-ai-widget', 'aria-label': 'GENELLA Visuals AI assistant' });
    widget.innerHTML =
      '<div class="gv-ai-panel" role="dialog" aria-modal="false" aria-label="GENELLA Visuals consultant chat">' +
        '<div class="gv-ai-header">' +
          '<div class="gv-ai-avatar"><img src="img/f-logo.png" alt=""></div>' +
          '<div class="gv-ai-title"><strong>GENELLA AI Consultant</strong><span>Sales, bookings and creative guidance</span></div>' +
          '<div class="gv-ai-tools">' +
            '<button class="gv-ai-icon-btn gv-ai-search-toggle" type="button" title="Search chat" aria-label="Search chat"><i class="fa fa-search"></i></button>' +
            '<button class="gv-ai-icon-btn gv-ai-export" type="button" title="Export chat" aria-label="Export conversation"><i class="fa fa-download"></i></button>' +
            '<button class="gv-ai-icon-btn gv-ai-clear" type="button" title="Clear history" aria-label="Clear chat history"><i class="fa fa-trash"></i></button>' +
            '<button class="gv-ai-icon-btn gv-ai-close" type="button" title="Close" aria-label="Close assistant"><i class="fa fa-times"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="gv-ai-search"><input type="search" placeholder="Search this conversation" aria-label="Search conversation"></div>' +
        '<div class="gv-ai-messages" aria-live="polite"></div>' +
        '<form class="gv-ai-composer">' +
          '<div class="gv-ai-upload-preview"></div>' +
          '<div class="gv-ai-composer-main">' +
            '<label class="gv-ai-attach" title="Attach file"><i class="fa fa-paperclip"></i><span class="gv-ai-visually-hidden">Attach file</span><input class="gv-ai-file" type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv,video/*" hidden></label>' +
            '<textarea class="gv-ai-input" rows="1" placeholder="Ask about packages, bookings, branding, websites..." aria-label="Message GENELLA AI Consultant"></textarea>' +
            '<button class="gv-ai-send" type="submit" aria-label="Send message"><i class="fa fa-send"></i></button>' +
          '</div>' +
        '</form>' +
      '</div>' +
      '<button class="gv-ai-launcher" type="button" aria-label="Open GENELLA AI Consultant"><i class="fa fa-comments"></i><span class="gv-ai-badge">1</span></button>';
    document.body.appendChild(widget);
    bindEvents(widget);
  }

  function bindEvents(widget) {
    $('.gv-ai-launcher', widget).addEventListener('click', function () {
      state.open = !state.open;
      widget.classList.toggle('is-open', state.open);
      $('.gv-ai-badge', widget).style.display = 'none';
      if (state.open) $('.gv-ai-input', widget).focus();
    });
    $('.gv-ai-close', widget).addEventListener('click', function () {
      state.open = false;
      widget.classList.remove('is-open');
    });
    $('.gv-ai-export', widget).addEventListener('click', exportTranscript);
    $('.gv-ai-clear', widget).addEventListener('click', clearHistory);
    $('.gv-ai-search-toggle', widget).addEventListener('click', function () {
      $('.gv-ai-search', widget).classList.toggle('is-visible');
      $('.gv-ai-search input', widget).focus();
    });
    $('.gv-ai-search input', widget).addEventListener('input', function (event) {
      var q = event.target.value.toLowerCase();
      Array.prototype.slice.call(document.querySelectorAll('.gv-ai-row')).forEach(function (row) {
        row.style.display = row.textContent.toLowerCase().indexOf(q) === -1 ? 'none' : '';
      });
    });
    $('.gv-ai-composer', widget).addEventListener('submit', function (event) {
      event.preventDefault();
      handleUser($('.gv-ai-input', widget).value);
    });
    $('.gv-ai-input', widget).addEventListener('input', function (event) {
      event.target.style.height = 'auto';
      event.target.style.height = Math.min(event.target.scrollHeight, 112) + 'px';
    });
    $('.gv-ai-input', widget).addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleUser(event.target.value);
      }
    });
    $('.gv-ai-file', widget).addEventListener('change', function (event) {
      state.pendingFiles = Array.prototype.slice.call(event.target.files).filter(function (file) {
        return file.size < 25 * 1024 * 1024;
      }).map(function (file) {
        return { name: file.name, type: file.type || 'document', size: file.size };
      });
      renderFilePreview();
      analytics('file_attached', { count: state.pendingFiles.length });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.open) {
        state.open = false;
        widget.classList.remove('is-open');
      }
    });
  }

  function welcome() {
    var sw = state.profile.language === 'sw';
    var content = sw
      ? 'Karibu GENELLA Visuals. Naweza kusaidia kuchagua package, kujibu bei, kuandaa booking, au kukupa ushauri wa creative kwa brand yako.'
      : 'Welcome to GENELLA Visuals. I can help you compare packages, plan a booking, review a creative idea, or choose the right photography, video, branding, or website support.';
    pushMessage('assistant', content, {
      actions: [
        { label: sw ? 'Book Now' : 'Book Now', prompt: sw ? 'Nataka kufanya booking' : 'I want to make a booking' },
        { label: 'WhatsApp', href: CONFIG.whatsapp, target: '_blank' },
        { label: sw ? 'View Packages' : 'View Packages', href: './pricing.html' }
      ]
    });
    var list = $('.gv-ai-messages');
    if (list) list.appendChild(suggestedChips(state.profile.language));
  }

  function restore() {
    var saved = safeJson(CONFIG.storageKey, null);
    if (saved && saved.profile) state.profile = Object.assign(state.profile, saved.profile);
    if (saved && saved.messages && saved.messages.length) {
      state.messages = saved.messages;
      state.messages.forEach(renderMessage);
      scrollBottom();
    } else {
      welcome();
    }
  }

  function loadKnowledge() {
    return fetch(CONFIG.knowledgeUrl, { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('Knowledge unavailable');
        return response.json();
      })
      .then(function (data) {
        state.knowledge = data;
        analytics('knowledge_loaded', { chunks: data.documents ? data.documents.length : 0 });
      })
      .catch(function () {
        state.knowledge = { documents: [] };
      });
  }

  function init() {
    if (!document.body || $('.gv-ai-widget')) return;
    buildWidget();
    loadKnowledge().then(restore);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
