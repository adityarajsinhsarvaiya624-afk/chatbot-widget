(function () {
  // 1. DYNAMIC SERVER DETECTION
  const getScriptSource = () => {
    const script = document.currentScript || document.querySelector('script[src*="chat-widget.js"]');

    // Allow manual override via data attribute (Critical for self-hosted widget files)
    if (script && script.getAttribute('data-server-url')) {
      return script.getAttribute('data-server-url');
    }

    if (script && script.src && script.src.startsWith('http')) {
      return new URL(script.src).origin;
    }
    if (window.location.origin.includes(':5001')) {
      return window.location.origin;
    }
    // Fallback search
    const scripts = document.getElementsByTagName('script');
    for (let s of scripts) {
      if (s.src && s.src.includes('chat-widget.js')) {
        try {
          return new URL(s.src).origin;
        } catch (e) { }
      }
    }
    return 'http://localhost:5001';
  };
  const SERVER_URL = getScriptSource();

  // THEME CONFIGURATION
  const scriptTag = document.currentScript || document.querySelector('script[src*="chat-widget.js"]');
  let siteContext = {};
  try {
    const rawContext = scriptTag?.getAttribute('data-site-context');
    if (rawContext) siteContext = JSON.parse(rawContext);
  } catch (e) {
    console.error('ChatWidget: Failed to parse data-site-context', e);
  }

  const CONFIG = {
    primaryColor: scriptTag?.getAttribute('data-primary-color') || '#007bff',
    botName: scriptTag?.getAttribute('data-bot-name') || 'Chat Support',
    welcomeMessage: scriptTag?.getAttribute('data-welcome-message') || 'How can I help you today?'
  };

  // 2. VISITOR ID & LOGGING
  let visitorId;
  try {
    visitorId = sessionStorage.getItem('chat_visitor_id');
    if (!visitorId) {
      visitorId = 'visitor_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('chat_visitor_id', visitorId);
    }
  } catch (e) {
    visitorId = 'visitor_' + Math.random().toString(36).substr(2, 9);
  }

  const logs = [];
  function addLog(msg) {
    logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    console.log('[ChatWidget]', msg);
  }
  addLog('Script started');
  addLog('Detected Server: ' + SERVER_URL);

  function showDebugLogs() {
    const existing = document.getElementById('chat-debug-box');
    if (existing) {
      existing.remove();
      return;
    }
    const d = document.createElement('div');
    d.id = 'chat-debug-box';
    d.style.cssText = "position:fixed;top:0;left:0;width:100%;height:300px;background:rgba(0,0,0,0.9);color:#0f0;font-family:monospace;font-size:11px;overflow:auto;z-index:2147483647;padding:10px;border-bottom:2px solid white;pointer-events:auto;";
    d.innerHTML = "<strong>Chat Widget Debug Logs (Triple-tap anywhere to close)</strong><hr>" + logs.join('<br>');
    document.body.appendChild(d);
    d.addEventListener('click', () => d.remove());
  }

  let lastTap = 0;
  let tapCount = 0;
  document.addEventListener('touchstart', (e) => {
    const now = Date.now();
    if (now - lastTap < 300) {
      tapCount++;
      if (tapCount >= 2) {
        showDebugLogs();
        tapCount = 0;
      }
    } else {
      tapCount = 0;
    }
    lastTap = now;
  }, { passive: true });

  // 3. LAZY SOCKET LOADING
  let socketInstance = null;
  function loadSocketIO(callback) {
    if (window.io) {
      callback();
      return;
    }
    addLog('Loading Socket.io...');
    const script = document.createElement('script');
    const localUrl = `${SERVER_URL}/socket.io/socket.io.js`;
    script.src = localUrl;

    script.onload = () => {
      addLog('Socket.io loaded from local server');
      callback();
    };
    script.onerror = () => {
      addLog('Failed local load, trying CDN...');
      const cdnScript = document.createElement('script');
      cdnScript.src = 'https://cdn.socket.io/4.6.0/socket.io.min.js';
      cdnScript.onload = () => {
        addLog('Socket.io loaded from CDN');
        callback();
      };
      cdnScript.onerror = () => addLog('CRITICAL: All Socket.io stores failed');
      document.head.appendChild(cdnScript);
    };
    document.head.appendChild(script);
  }

  // 4. WIDGET INITIALIZATION
  function initWidget() {
    addLog('Initializing Widget UI...');

    // Helper to darken/lighten hex color
    function adjustColor(color, amount) {
      return '#' + color.replace(/^#/, '').replace(/../g, color => ('0' + Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
    }

    const container = document.createElement('div');
    container.id = 'chat-widget-container';
    container.style.position = 'fixed';
    container.style.inset = '0';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '2147483647';
    document.body.appendChild(container);

    const shadow = container.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

      :host {
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        --primary-gradient: linear-gradient(135deg, ${CONFIG.primaryColor}, ${adjustColor(CONFIG.primaryColor, -20)});
        --glass-bg: rgba(255, 255, 255, 0.85);
        --glass-border: rgba(255, 255, 255, 0.5);
        --shadow-lg: 0 12px 40px rgba(0, 0, 0, 0.12);
        --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
      }

      .chat-button {
        position: absolute;
        pointer-events: auto;
        bottom: 25px;
        right: 25px;
        background: var(--primary-gradient);
        color: white;
        border: none;
        border-radius: 50%;
        width: 60px;
        height: 60px;
        cursor: pointer;
        box-shadow: var(--shadow-lg);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s;
      }

      .chat-button:hover { 
        transform: scale(1.1) rotate(5deg);
        box-shadow: 0 15px 45px rgba(0,0,0,0.2);
      }

      /* Container for icons to ensure perfect centering */
      .chat-button .msg-icon,
      .chat-button .close-icon {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .chat-button svg {
        width: 28px;
        height: 28px;
        fill: none; /* SVG content handles fill/stroke */
        stroke: currentColor;
      }
      
      /* Visually center the message icon (offset for tail) */
      .chat-button .msg-icon svg {
        transform: translateY(-2px); 
      }
      
      .chat-button .close-icon {
        opacity: 0;
        transform: scale(0.5) rotate(-90deg);
      }

      .chat-button.open .msg-icon {
        opacity: 0;
        transform: scale(0.5) rotate(90deg);
      }

      .chat-button.open .close-icon {
        opacity: 1;
        transform: scale(1) rotate(0deg);
      }

      .chat-window {
        position: absolute;
        pointer-events: auto;
        bottom: 100px;
        right: 25px;
        width: 380px;
        height: 600px;
        max-height: calc(100vh - 120px); /* Prevent top-overflow on small laptop screens */
        background: var(--glass-bg);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid var(--glass-border);
        border-radius: 24px;
        box-shadow: var(--shadow-lg);
        display: none;
        flex-direction: column;
        z-index: 9999;
        overflow: hidden;
        transform-origin: bottom right;
        opacity: 0;
        transform: scale(0.9) translateY(20px);
        transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
      }

      .chat-window.open {
        display: flex;
        opacity: 1;
        transform: scale(1) translateY(0);
      }

      .chat-header { 
        background: var(--primary-gradient); 
        color: white; 
        padding: 20px 24px; 
        display: flex; 
        justify-content: space-between; 
        align-items: center; 
        box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      }

      .header-info {
        display: flex;
        flex-direction: column;
      }

      .bot-name {
        font-weight: 600;
        font-size: 17px;
        letter-spacing: -0.01em;
      }


      .header-actions .min-btn {
        background: rgba(255,255,255,0.2); 
        border: none; 
        color: white; 
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer; 
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }
      
      .header-actions .min-btn:hover {
        background: rgba(255,255,255,0.35);
      }

      .chat-messages { 
        flex: 1; 
        padding: 20px; 
        overflow-y: auto; 
        display: flex; 
        flex-direction: column; 
        gap: 12px; 
        scrollbar-width: thin;
      }

      /* Custom Scrollbar */
      .chat-messages::-webkit-scrollbar {
        width: 6px;
      }
      .chat-messages::-webkit-scrollbar-track {
        background: transparent;
      }
      .chat-messages::-webkit-scrollbar-thumb {
        background: rgba(0,0,0,0.1);
        border-radius: 3px;
      }

      .message { 
        padding: 12px 18px; 
        border-radius: 18px; 
        max-width: 85%; 
        font-size: 14.5px; 
        line-height: 1.5; 
        box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        animation: messageSlideIn 0.3s ease-out forwards;
        opacity: 0;
        transform: translateY(10px);
        position: relative;
      }

      @keyframes messageSlideIn {
        to { opacity: 1; transform: translateY(0); }
      }

      .message.user { 
        background: ${CONFIG.primaryColor};
        background: var(--primary-gradient); 
        color: white !important; 
        align-self: flex-end; 
        border-bottom-right-radius: 4px; 
      }

      .message.bot { 
        background: white; 
        color: #1f2937 !important; 
        align-self: flex-start; 
        border-bottom-left-radius: 4px; 
        border: 1px solid #f3f4f6;
      }

      .typing-indicator {
        background: white;
        border: 1px solid #f3f4f6;
        padding: 12px 16px;
        border-radius: 18px;
        border-bottom-left-radius: 4px;
        width: fit-content;
        display: flex;
        gap: 4px;
        box-shadow: var(--shadow-md);
        margin-bottom: 12px;
        align-self: flex-start;
      }

      .typing-dot {
        width: 6px;
        height: 6px;
        background: #9ca3af;
        border-radius: 50%;
        animation: typingAnimation 1.4s infinite ease-in-out both;
      }
      
      .typing-dot:nth-child(1) { animation-delay: -0.32s; }
      .typing-dot:nth-child(2) { animation-delay: -0.16s; }
      
      @keyframes typingAnimation {
        0%, 80%, 100% { transform: scale(0); }
        40% { transform: scale(1); }
      }

      .chat-input-area { 
        padding: 16px 20px; 
        background: rgba(255,255,255,0.9);
        border-top: 1px solid rgba(0,0,0,0.05); 
        display: flex; 
        align-items: center;
        gap: 10px;
        backdrop-filter: blur(5px);
      }

      .chat-input { 
        flex: 1; 
        padding: 14px 20px; 
        border: 1px solid #e5e7eb; 
        border-radius: 30px; 
        outline: none; 
        font-size: 14px;
        transition: all 0.2s;
        background: #f9fafb;
        color: #374151 !important;
      }

      .chat-input:focus { 
        border-color: ${CONFIG.primaryColor}; 
        background: white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      }

      .send-btn { 
        background: var(--primary-gradient); 
        color: white; 
        border: none; 
        width: 48px;
        height: 48px;
        border-radius: 50%; 
        cursor: pointer; 
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      }

      .send-btn:hover { 
        transform: scale(1.05); 
        box-shadow: 0 6px 16px rgba(0,0,0,0.15);
      }
      
      .send-btn svg {
        width: 20px;
        height: 20px;
        fill: white;
        margin-left: 2px;
      }

      /* Chips, Images, Tables remain similar but refined */
      .suggestion-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
        margin-bottom: 8px;
      }
      
      .chip {
        background: white;
        color: ${CONFIG.primaryColor};
        border: 1px solid ${CONFIG.primaryColor};
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .chip:hover {
        background: ${CONFIG.primaryColor};
        color: white;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      }

      @media (max-width: 768px) {
        .chat-window { 
          width: 100%;
          height: 100%;
          height: 100dvh;
          bottom: 0;
          right: 0;
          border-radius: 0;
          display: none;
        }
        .chat-window.open {
          display: flex;
        }
        .chat-button.open {
            display: none;
        }
      }
    `;
    shadow.appendChild(style);

    // SVG Icons
    // SVG Icons (Lucide-style Rounded)
    const ICONS = {
      msg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
      close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
      send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>',
      down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>'
    };

    const chatButton = document.createElement('button');
    chatButton.className = 'chat-button';
    chatButton.innerHTML = `
      <div class="msg-icon">${ICONS.msg}</div>
      <div class="close-icon">${ICONS.close}</div>
    `;

    const chatWindow = document.createElement('div');
    chatWindow.className = 'chat-window';
    chatWindow.innerHTML = `
      <div class="chat-header">
        <div class="header-info">
          <span class="bot-name">${CONFIG.botName}</span>
        </div>
        <div class="header-actions">
          <button class="min-btn">${ICONS.down}</button>
        </div>
      </div>
      <div class="chat-messages" id="messages"></div>
      <div class="chat-input-area">
        <input type="text" class="chat-input" placeholder="Type a message..." />
        <button class="send-btn">${ICONS.send}</button>
      </div>
    `;

    shadow.appendChild(chatButton);
    shadow.appendChild(chatWindow);

    const messagesContainer = chatWindow.querySelector('#messages');
    const input = chatWindow.querySelector('.chat-input');
    const sendBtn = chatWindow.querySelector('.send-btn');
    const minBtn = chatWindow.querySelector('.min-btn');

    // SHOW WELCOME MESSAGE IMMEDIATELY (OFFLINE MODE)
    // This ensures the user sees something even if the server is slow to connect
    if (CONFIG.welcomeMessage) {
      addMessage(CONFIG.welcomeMessage, 'bot', null, [
        "Tell me about extensions",
        "Contact Support",
        "How to install?"
      ]);
    }

    let isOpen = false;
    function toggleChat() {
      isOpen = !isOpen;
      if (isOpen) {
        chatWindow.style.display = 'flex';
        chatWindow.offsetHeight; // Force reflow
        chatWindow.classList.add('open');
        chatButton.classList.add('open');
        input.focus();
        scrollToBottom();

        // Load socket if not loaded
        if (!socketInstance) {
          // REQUIREJS HACK: Magento uses RequireJS which hijacks socket.io. 
          // We temporarily hide 'define' so socket.io attaches to window.io globally.
          const backupDefine = window.define;
          window.define = null;

          // Priority: Try CDN first for reliability on external sites
          const cdnScript = document.createElement('script');
          cdnScript.src = 'https://cdn.socket.io/4.6.0/socket.io.min.js';
          cdnScript.onload = () => {
            if (backupDefine) window.define = backupDefine; // Restore RequireJS
            addLog('Socket.io loaded from CDN');
            initSocket();
          };
          cdnScript.onerror = () => {
            if (backupDefine) window.define = backupDefine; // Restore RequireJS
            // Fallback to local
            loadSocketIO(initSocket);
          };
          document.head.appendChild(cdnScript);
        }
      } else {
        chatWindow.classList.remove('open');
        chatButton.classList.remove('open');
        setTimeout(() => {
          if (!isOpen) chatWindow.style.display = 'none';
        }, 300);
      }
    }

    chatButton.addEventListener('click', toggleChat);
    minBtn.addEventListener('click', toggleChat);

    function scrollToBottom(force = false) {
      const threshold = 50;
      const isAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < threshold;
      if (force || isAtBottom) {
        messagesContainer.scrollTo({
          top: messagesContainer.scrollHeight,
          behavior: force ? 'auto' : 'smooth'
        });
      }
    }

    function scrollToElement(el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function parseMarkdown(text) {
      if (!text) return '';

      let lines = text.split('\n');
      let output = '';
      let inList = false;
      let inTable = false;
      let tableHeader = true;

      lines.forEach(line => {
        let trimmed = line.trim();

        // Escape HTML for safety but keep our tags
        let processed = trimmed
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

        // Bold (**text**)
        processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Italic (*text*)
        processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Simple Links (Sanitized)
        processed = processed.replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
          // Security: Prevent javascript: or data: links
          if (url.match(/^(javascript:|data:)/i)) return text;
          return `<a href="${url}" target="_blank" style="color:${CONFIG.primaryColor}">${text}</a>`;
        });

        // TABLES
        if (processed.includes('|') && (processed.match(/|/g) || []).length > 1) {
          if (!inTable) {
            output += '<table>';
            inTable = true;
            tableHeader = true;
          }

          // Skip the separator line |---|---|
          if (processed.includes('---')) return;

          const cells = processed.split('|').filter(c => c.trim() !== '' || (processed.startsWith('|') && processed.endsWith('|')));
          const tag = tableHeader ? 'th' : 'td';
          output += '<tr>';
          cells.forEach(cell => {
            if (cell.trim() === '' && !processed.includes('| |')) return;
            output += `<${tag}>${cell.trim()}</${tag}>`;
          });
          output += '</tr>';
          tableHeader = false;
          return;
        } else if (inTable) {
          output += '</table>';
          inTable = false;
        }

        // LISTS
        if (processed.startsWith('- ')) {
          if (!inList) {
            output += '<ul>';
            inList = true;
          }
          output += `<li>${processed.substring(2)}</li>`;
        } else {
          if (inList) {
            output += '</ul>';
            inList = false;
          }
          // Paragraphs for non-empty lines
          if (processed.length > 0) {
            output += `<p>${processed}</p>`;
          }
        }
      });

      if (inList) output += '</ul>';
      if (inTable) output += '</table>';
      return output;
    }

    function addMessage(text, sender, messageId = null, suggestions = []) {
      const isNewMessage = messageId && !messagesContainer.querySelector(`[data-msg-id="${messageId}"]`);
      removeTypingIndicator();

      // Remove any existing suggestion chips before adding new ones
      const oldChips = messagesContainer.querySelector('.suggestion-chips');
      if (oldChips) oldChips.remove();

      // If a message with this ID already exists (streaming update), update it
      if (messageId && !isNewMessage) {
        let existingMsg = messagesContainer.querySelector(`[data-msg-id="${messageId}"]`);
        if (existingMsg) {
          existingMsg.innerHTML = parseMarkdown(text);
          scrollToBottom(); // Only scroll if already at bottom
          return;
        }
      }

      const msgDiv = document.createElement('div');
      msgDiv.className = `message ${sender}`;
      if (messageId) msgDiv.setAttribute('data-msg-id', messageId);

      // Use innerHTML instead of textContent to render the formatting
      if (sender === 'bot') {
        msgDiv.innerHTML = parseMarkdown(text);
      } else {
        msgDiv.textContent = text; // Keep user messages as plain text
      }
      messagesContainer.appendChild(msgDiv);

      // ADD CHIPS IF PROVIDED
      if (suggestions && suggestions.length > 0) {
        const chipContainer = document.createElement('div');
        chipContainer.className = 'suggestion-chips';
        suggestions.forEach(s => {
          const chip = document.createElement('button');
          chip.className = 'chip';
          chip.textContent = s;
          chip.onclick = () => {
            input.value = s;
            sendMessage();
            chipContainer.remove();
          };
          chipContainer.appendChild(chip);
        });
        messagesContainer.appendChild(chipContainer);
      }

      if (sender === 'bot' && isNewMessage) {
        // When a new bot message starts, make sure its beginning is visible
        scrollToElement(msgDiv);
      } else {
        scrollToBottom(true); // Force scroll for user messages
      }
    }

    function showTypingIndicator() {
      if (messagesContainer.querySelector('.typing-indicator')) return;
      const indicator = document.createElement('div');
      indicator.className = 'typing-indicator';
      indicator.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      `;
      messagesContainer.appendChild(indicator);
      scrollToBottom();
    }

    function removeTypingIndicator() {
      const indicator = messagesContainer.querySelector('.typing-indicator');
      if (indicator) indicator.remove();
    }

    function initSocket() {
      addLog('Connecting to socket...');
      socketInstance = io(SERVER_URL);
      socketInstance.on('connect', () => {
        addLog('Socket Connected! ID: ' + socketInstance.id);
        socketInstance.emit('join_conversation', { visitorId });
      });
      socketInstance.on('chat_history', (history) => {
        messagesContainer.innerHTML = '';
        if (history.length === 0 && CONFIG.welcomeMessage) {
          addMessage(CONFIG.welcomeMessage, 'bot', null, [
            "Tell me about extensions",
            "Contact Support",
            "How to install?"
          ]);
        }
        history.forEach(msg => {
          addMessage(msg.content, msg.sender === 'user' ? 'user' : 'bot');
        });
      });
      socketInstance.on('receive_message', (msg) => {
        addMessage(msg.content, msg.sender === 'user' ? 'user' : 'bot', msg._id);
      });

      const streamingMessages = {};

      socketInstance.on('chat_chunk', (chunk) => {
        removeTypingIndicator();
        const msgId = chunk._id;
        if (!streamingMessages[msgId]) {
          streamingMessages[msgId] = "";
        }
        streamingMessages[msgId] += chunk.content;
        addMessage(streamingMessages[msgId], 'bot', msgId);
      });
    }

    function getPageContent() {
      try {
        const title = document.title;
        const metaDesc = document.querySelector('meta[name="description"]')?.content || "";
        const h1s = Array.from(document.querySelectorAll('h1')).map(h => h.innerText).join('; ');
        const h2s = Array.from(document.querySelectorAll('h2')).map(h => h.innerText).join('; ');

        // EXTRACT INTERACTIVE ELEMENTS (Functional Map)
        const interactives = [];
        const selector = 'button, input, a, select, [role="button"]';
        document.querySelectorAll(selector).forEach(el => {
          // Ignore the chatbot's own elements
          if (el.closest('#chat-widget-container') || el.closest('#chat-debug-box')) return;

          const label = el.innerText || el.getAttribute('aria-label') || el.placeholder || el.title || el.value;
          if (label && label.length < 100) { // Only grab concise labels
            interactives.push(`${el.tagName.toLowerCase()}: "${label.trim()}"`);
          }
        });

        // Get visible text, excluding scripts and styles
        const bodyClone = document.body.cloneNode(true);
        // Remove known widget elements and scripts/styles from the clone
        const toRemove = bodyClone.querySelectorAll('script, style, #chat-widget-container, #chat-debug-box');
        toRemove.forEach(el => el.remove());

        const bodyText = bodyClone.innerText.replace(/\s+/g, ' ').trim().substring(0, 5000); // Limit to 5000 chars

        return {
          title,
          url: window.location.href,
          description: metaDesc,
          headings: { h1: h1s, h2: h2s },
          uiMap: interactives.slice(0, 50), // Limit to top 50 elements
          contentSnippet: bodyText
        };
      } catch (e) {
        console.error('ChatWidget: Extraction failed', e);
        return { error: 'Extraction failed' };
      }
    }

    function sendMessage() {
      const text = input.value.trim();
      if (!text) return;

      if (!socketInstance) {
        addLog('ERROR: Attempted to send message but socket is not connected.');

        // Attempt to recover
        if (window.io) {
          addLog('Recovery: Re-initializing socket...');
          initSocket();
          // Show a small toast to user
          const toast = document.createElement('div');
          toast.textContent = "Reconnecting... please wait.";
          toast.style.cssText = "position:absolute;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:white;padding:5px 10px;border-radius:4px;font-size:12px;opacity:0;transition:opacity 0.3s;";
          chatWindow.appendChild(toast);
          setTimeout(() => toast.style.opacity = '1', 10);
          setTimeout(() => toast.remove(), 3000);
        } else {
          alert("Unable to connect to chat server. Please check your internet or strict firewall settings.");
        }
        return;
      }

      const dynamicContent = getPageContent();
      const combinedContext = {
        manualContext: siteContext,
        pageContent: dynamicContent
      };

      socketInstance.emit('send_message', {
        visitorId,
        content: text,
        siteContext: combinedContext
      });
      showTypingIndicator();
      input.value = '';
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });

    // PROACTIVE GREETING
    setTimeout(() => {
      if (!isOpen) {
        const url = window.location.href.toLowerCase();
        let proactiveMsg = "";

        if (url.includes('pricing')) {
          proactiveMsg = "I see you're checking our pricing! Need a hand choosing the right plan?";
        } else if (url.includes('contact')) {
          proactiveMsg = "Need help? You can message us right here for a quick answer!";
        } else if (document.getElementById('chat-premium-demo')) { // Custom check for our demo
          proactiveMsg = "Welcome to the Premium Demo! Try asking me about 'Recurring Payments'.";
        }

        if (proactiveMsg) {
          toggleChat();
          // We add it as a bot message with a small delay so it feels natural
          setTimeout(() => {
            addMessage(proactiveMsg, 'bot', null, ["Learn more", "View all features"]);
          }, 800);
        }
      }
    }, 5000);
  }

  // EXECUTE IMMEDIATELY
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initWidget);
    } else {
      initWidget();
    }
    addLog('Init sequence triggered');
  } catch (err) {
    addLog('CRITICAL INIT ERROR: ' + err.message);
  }
})();
