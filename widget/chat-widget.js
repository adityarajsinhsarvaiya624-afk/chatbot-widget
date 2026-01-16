(function () {
  // 1. DYNAMIC SERVER DETECTION
  const getScriptSource = () => {
    const script = document.currentScript;
    if (script && script.src && script.src.startsWith('http')) {
      return new URL(script.src).origin;
    }
    if (window.location.origin.includes(':5001')) {
      return window.location.origin;
    }
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
    visitorId = localStorage.getItem('chat_visitor_id');
    if (!visitorId) {
      visitorId = 'visitor_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('chat_visitor_id', visitorId);
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
        background: white;
        border-radius: 20px;
        box-shadow: 0 12px 48px rgba(0,0,0,0.12);
        display: none;
        flex-direction: column;
        z-index: 9999;
        overflow: hidden;
        border: 1px solid rgba(0,0,0,0.08);
        transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s;
        transform-origin: bottom right;
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
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        text-align: left;
      }
      .message.user { 
        background: ${CONFIG.primaryColor}; 
        color: white; 
        align-self: flex-end; 
        border-bottom-right-radius: 4px; 
      }
      .message.bot { 
        background: #f1f3f5; 
        color: #212529; 
        align-self: flex-start; 
        border-bottom-left-radius: 4px; 
      }
      .message.bot p { margin: 0 0 8px 0; }
      .message.bot p:last-child { margin-bottom: 0; }
      .message.bot ul { margin: 0 0 8px 0; padding-left: 20px; }
      .message.bot li { margin-bottom: 4px; }
      .message.bot strong { font-weight: 600; }
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
      chatWindow.style.display = isOpen ? 'flex' : 'none';
      if (isOpen) {
        input.focus();
        scrollToBottom();
        // Load socket when chat is opened for the first time if not already
        if (!socketInstance) {
          loadSocketIO(initSocket);
        }
      }
    }

    chatButton.addEventListener('click', toggleChat);
    closeBtn.addEventListener('click', toggleChat);

    function scrollToBottom() {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function parseMarkdown(text) {
      if (!text) return '';
      let html = text
        // Escape HTML first to prevent XSS (basic)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        // Bold (**text**)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Italic (*text*)
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Lists (- item) - fix to wrap in <ul> not just replace lines
        .replace(/^\s*-\s+(.*)$/gm, '<li>$1</li>');

      // Wrap list items in ul (simple heuristic: if we have li, wrap them)
      // This is a simplified parser. For strict lists, we'd need more logic.
      // But for this chatbot, just replacing - with <li> and then wrapping consecutive <li>s 
      // is a bit complex for regex only. 
      // Let's stick to simple line breaks for now, and maybe manual bullets if needed.
      // Better approach for lists in simple regex:
      // Just convert " - " to a bullet character for visual clarity if we don't do full UL/OL
      // OR try to do a robust replace.

      // Let's use a cleaner approach for the list:
      // 1. Split by newlines
      // 2. Process each line

      let lines = text.split('\n');
      let output = '';
      let inList = false;

      lines.forEach(line => {
        let trimmed = line.trim();
        // Escape HTML
        trimmed = trimmed
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

        // Bold/Italic
        trimmed = trimmed
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');

        if (trimmed.startsWith('- ')) {
          if (!inList) {
            output += '<ul>';
            inList = true;
          }
          output += `<li>${trimmed.substring(2)}</li>`;
        } else {
          if (inList) {
            output += '</ul>';
            inList = false;
          }
          // Paragraphs for non-empty lines
          if (trimmed.length > 0) {
            output += `<p>${trimmed}</p>`;
          }
        }
      });

      if (inList) output += '</ul>';
      return output;
    }

    function addMessage(text, sender) {
      const msgDiv = document.createElement('div');
      msgDiv.className = `message ${sender}`;
      // Use innerHTML instead of textContent to render the formatting
      if (sender === 'bot') {
        msgDiv.innerHTML = parseMarkdown(text);
      } else {
        msgDiv.textContent = text; // Keep user messages as plain text
      }
      messagesContainer.appendChild(msgDiv);
      scrollToBottom();
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
          addMessage(CONFIG.welcomeMessage, 'bot');
        }
        history.forEach(msg => {
          addMessage(msg.content, msg.sender === 'user' ? 'user' : 'bot');
        });
      });
      socketInstance.on('receive_message', (msg) => {
        addMessage(msg.content, msg.sender === 'user' ? 'user' : 'bot');
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
      input.value = '';
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
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
