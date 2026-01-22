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
      :host {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      .chat-button {
        position: absolute;
        pointer-events: auto;
        bottom: 25px;
        right: 25px;
        background-color: ${CONFIG.primaryColor};
        color: white;
        border: none;
        border-radius: 50%;
        width: 56px;
        height: 56px;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 26px;
        z-index: 9999;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .chat-button:hover { 
        transform: scale(1.08) translateY(-2px);
        box-shadow: 0 12px 32px rgba(0,0,0,0.2);
      }
      .chat-window {
        position: absolute;
        pointer-events: auto;
        bottom: 95px;
        right: 25px;
        width: 380px;
        height: 580px;
        background: rgba(255, 255, 255, 0.75);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 20px;
        box-shadow: 0 12px 48px rgba(0,0,0,0.15);
        display: none;
        flex-direction: column;
        z-index: 9999;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.3);
        transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        transform-origin: bottom right;
        opacity: 0;
        transform: scale(0.9);
      }
      .chat-window.open {
        display: flex;
        opacity: 1;
        transform: scale(1);
      }
      .chat-header { 
        background: ${CONFIG.primaryColor}; 
        color: white; 
        padding: 20px 24px; 
        font-weight: 600; 
        font-size: 16px;
        display: flex; 
        justify-content: space-between; 
        align-items: center; 
        letter-spacing: -0.01em;
      }
      .close-btn { 
        background: rgba(255,255,255,0.15); 
        border: none; 
        color: white; 
        font-size: 18px; 
        cursor: pointer; 
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }
      .close-btn:hover { background: rgba(255,255,255,0.25); }
      .chat-messages { 
        flex: 1; 
        padding: 24px; 
        overflow-y: auto; 
        display: flex; 
        flex-direction: column; 
        gap: 16px; 
        background: #fdfdfd; 
        scrollbar-width: thin;
      }
      .message { 
        padding: 12px 16px; 
        border-radius: 18px; 
        max-width: 85%; 
        font-size: 14.5px; 
        line-height: 1.5; 
        word-wrap: break-word;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        text-align: left;
        animation: messageSlideIn 0.3s ease-out forwards;
        opacity: 0;
        transform: translateY(10px);
      }
      @keyframes messageSlideIn {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .message.user { 
        background: ${CONFIG.primaryColor}; 
        color: white; 
        align-self: flex-end; 
        border-bottom-right-radius: 4px; 
      }
      .message.bot { 
        background: rgba(241, 243, 245, 0.8); 
        color: #212529; 
        align-self: flex-start; 
        border-bottom-left-radius: 4px; 
      }
      .message.bot p { margin: 0 0 8px 0; }
      .message.bot p:last-child { margin-bottom: 0; }
      .message.bot ul { margin: 0 0 8px 0; padding-left: 20px; }
      .message.bot li { margin-bottom: 4px; }
      .message.bot strong { font-weight: 600; }

      .typing-indicator {
        display: flex;
        gap: 4px;
        padding: 12px 16px;
        background: rgba(241, 243, 245, 0.8);
        border-radius: 18px;
        border-bottom-left-radius: 4px;
        align-self: flex-start;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        margin-bottom: 16px;
      }
      .typing-dot {
        width: 6px;
        height: 6px;
        background: #90949c;
        border-radius: 50%;
        animation: typingBounce 1.4s infinite ease-in-out both;
      }
      .typing-dot:nth-child(1) { animation-delay: -0.32s; }
      .typing-dot:nth-child(2) { animation-delay: -0.16s; }
      @keyframes typingBounce {
        0%, 80%, 100% { transform: scale(0); }
        40% { transform: scale(1.0); }
      }
      .chat-input-area { 
        padding: 20px 24px; 
        border-top: 1px solid #f1f3f5; 
        display: flex; 
        gap: 12px; 
        background: white; 
        align-items: center;
      }
      .chat-input { 
        flex: 1; 
        padding: 12px 18px; 
        border: 1px solid #e9ecef; 
        border-radius: 24px; 
        outline: none; 
        font-size: 14px;
        transition: border-color 0.2s, box-shadow 0.2s;
        background: #f8f9fa;
      }
      .chat-input:focus { 
        border-color: ${CONFIG.primaryColor}; 
        box-shadow: 0 0 0 3px ${CONFIG.primaryColor}22;
        background: white;
      }
      .send-btn { 
        background: ${CONFIG.primaryColor}; 
        color: white; 
        border: none; 
        width: 40px;
        height: 40px;
        border-radius: 50%; 
        cursor: pointer; 
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, opacity 0.2s;
        flex-shrink: 0;
      }
      .send-btn:hover { transform: scale(1.05); }
      .send-btn:active { transform: scale(0.95); }
      .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      /* Suggested Replies Chips */
      .suggestion-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
        align-self: flex-start;
      }
      .chip {
        background: white;
        color: ${CONFIG.primaryColor};
        border: 1px solid ${CONFIG.primaryColor};
        padding: 6px 14px;
        border-radius: 18px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 6px rgba(0,0,0,0.05);
      }
      .chip:hover {
        background: ${CONFIG.primaryColor};
        color: white;
        transform: translateY(-1px);
      }

      /* Tables */
      table {
        border-collapse: collapse;
        width: 100%;
        margin: 10px 0;
        font-size: 13px;
        background: white;
        border-radius: 8px;
        overflow: hidden;
      }
      th, td {
        border: 1px solid #e9ecef;
        padding: 8px 10px;
        text-align: left;
      }
      th {
        background: #f8f9fa;
        font-weight: 600;
      }
      tr:nth-child(even) {
        background: #fdfdfd;
      }
      
      /* Images */
      .message-img {
        max-width: 100%;
        border-radius: 8px;
        margin: 8px 0;
        display: block;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      }

      @media (max-width: 480px) {
        .chat-window { 
          width: calc(100vw - 32px); 
          height: auto;
          max-height: calc(100vh - 100px - env(safe-area-inset-bottom, 0px)); 
          bottom: calc(85px + env(safe-area-inset-bottom, 0px)); 
          right: 16px; 
          left: 16px;
          margin: 0 auto;
        }
        .chat-button { 
          bottom: calc(20px + env(safe-area-inset-bottom, 0px)); 
          right: 20px; 
        }
        .chat-messages {
          padding: 16px;
        }
        .chat-header {
          padding: 16px 20px;
        }
        .chat-input-area {
          padding: 16px 20px;
        }
        .send-btn {
          width: 44px;
          height: 44px;
        }
      }

      /* Landscape or very short screens */
      @media (max-height: 500px) {
        .chat-window {
          height: calc(100vh - 40px);
          bottom: 20px;
        }
        .chat-button { display: none; } /* Hide button when window takes over in short landscape */
      }
    `;
    shadow.appendChild(style);

    const chatButton = document.createElement('button');
    chatButton.className = 'chat-button';
    chatButton.innerHTML = '💬';

    const chatWindow = document.createElement('div');
    chatWindow.className = 'chat-window';
    chatWindow.innerHTML = `
      <div class="chat-header">
        <span>${CONFIG.botName}</span>
        <button class="close-btn">×</button>
      </div>
      <div class="chat-messages" id="messages"></div>
      <div class="chat-input-area">
        <input type="text" class="chat-input" placeholder="Type a message..." />
        <button class="send-btn">Send</button>
      </div>
    `;

    shadow.appendChild(chatButton);
    shadow.appendChild(chatWindow);

    const messagesContainer = chatWindow.querySelector('#messages');
    const input = chatWindow.querySelector('.chat-input');
    const sendBtn = chatWindow.querySelector('.send-btn');
    const closeBtn = chatWindow.querySelector('.close-btn');

    let isOpen = false;
    function toggleChat() {
      isOpen = !isOpen;
      if (isOpen) {
        chatWindow.style.display = 'flex';
        // Force reflow for animation
        chatWindow.offsetHeight;
        chatWindow.classList.add('open');
        input.focus();
        scrollToBottom();
        // Load socket when chat is opened for the first time if not already
        if (!socketInstance) {
          loadSocketIO(initSocket);
        }
      } else {
        chatWindow.classList.remove('open');
        setTimeout(() => {
          if (!isOpen) chatWindow.style.display = 'none';
        }, 300);
      }
    }

    chatButton.addEventListener('click', toggleChat);
    closeBtn.addEventListener('click', toggleChat);

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
        // Simple Links
        processed = processed.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color:${CONFIG.primaryColor}">$1</a>');
        // Images ![alt](url)
        processed = processed.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="message-img" />');

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
      if (!text || !socketInstance) return;

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
