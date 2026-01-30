# Local Server Deployment Guide

Follow these steps to deploy your chatbot backend on a company server (e.g., a Windows Server or a dedicated PC on the network).

## 1. Prerequisites
Ensure the server has:
- **Node.js**: [Download LTS Version](https://nodejs.org/)
- **Git** (Optional, for pulling code): [Download Git](https://git-scm.com/)

## 2. Setup the Code on Server
1.  **Copy your project folder** to the server (e.g., `C:\Apps\chatbot`).
2.  Open a terminal (PowerShell or Command Prompt) in that folder.
3.  Install dependencies:
    ```powershell
    npm install
    ```
4.  Install **PM2** (Process Manager) globally to keep the server running even if you logout:
    ```powershell
    npm install -g pm2
    ```

## 3. Configure Network & Firewall
Your server needs to accept connections from other computers on the network.
1.  **Find Server IP:**
    - Run `ipconfig` in the terminal.
    - Look for "IPv4 Address" (e.g., `192.168.1.50`).
2.  **Open Port In Firewall:**
    - Open "Windows Defender Firewall with Advanced Security".
    - Click **Result Rules** -> **New Rule**.
    - Select **Port** -> **TCP** -> **Specific local ports: 5001** (or your chosen port).
    - Select **Allow the connection**.
    - Name it "Chatbot Server".

## 4. update Environment Variables
Create or update the `.env` file in the project folder:
```ini
PORT=5001
# Allow any computer on the network to connect
ALLOWED_ORIGINS=*
# Your AI Key
GEMINI_API_KEY=your_actual_key_here
```

## 5. Start the Server
Use PM2 to start the server:
```powershell
pm2 start backend/server.js --name "chatbot-backend"
pm2 save
pm2 startup
```
*(Run the command displayed by `pm2 startup` if asked)*

## 6. Update the Widget Embed Code
On your website (or the computers that will use the bot), update the script tag to point to your **Server's IP**:

```html
<script 
  src="http://192.168.1.50:5001/widget/chat-widget.js" 
  data-server-url="http://192.168.1.50:5001"
></script>
```
*Replace `192.168.1.50` with your actual Server IP found in Step 3.*

## 7. Enabling HTTPS (Secure Connection)

If your website is HTTPS (secure), your chatbot backend MUST also be HTTPS.

### Step A: Get Certificates
You need two files: `server.key` (Private Key) and `server.crt` (Certificate).

**Option 1: Self-Signed (For Local Testing)**
You can generate these using OpenSSL or online tools. Note: Browsers will show a warning.

**Option 2: Trusted Certificate (For Production)**
Use a domain name (e.g., `chat.mycompany.com`) and get a free cert from [Let's Encrypt](https://letsencrypt.org/).

### Step B: Configure Backend
1.  Place your `server.key` and `server.crt` files in a folder on the server (e.g., `C:\Apps\chatbot\certs`).
2.  Update your `.env` file:
    ```ini
    # Standard Config
    PORT=5001
    ALLOWED_ORIGINS=*
    GEMINI_API_KEY=your_key
    

    
    # HTTPS Config
    SSL_KEY_PATH=C:\Apps\chatbot\certs\server.key
    SSL_CERT_PATH=C:\Apps\chatbot\certs\server.crt
    ```
3.  Restart the server:
    ```powershell
    pm2 restart chatbot-backend
    ```

### Step C: Update Embed Code
Change `http://` to `https://` in your website script:
```html
<script 
  src="https://192.168.1.50:5001/widget/chat-widget.js" 
  data-server-url="https://192.168.1.50:5001"
></script>
```

## Troubleshooting
- **Cannot connect?** Try turning off the firewall temporarily to test. If it works, your firewall rule is wrong.
- **Console Errors?** Check server logs with `pm2 logs chatbot-backend`.
