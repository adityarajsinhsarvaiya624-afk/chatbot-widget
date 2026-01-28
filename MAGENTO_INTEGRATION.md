# Magento 2 Chatbot Integration Guide

This guide explains how to embed your AI chatbot into a Magento 2 website.

## Prerequisites

1.  **Backend URL**: You must have your chatbot backend deployed (e.g., on Render).
    - Current identified URL: `https://chatbot-widget-ghh8.onrender.com`
2.  **CORS Configuration**:
    - **Development/Open**: If your backend `ALLOWED_ORIGINS` environment variable is not set (or commented out), it defaults to `*`, allowing ALL websites (including `milople.com`) to connect.
    - **Production (Recommended)**: Since `milople.com` is the **only** website you are integrating for now, you should lock it down.
        > **IMPORTANT**: Render does NOT do this automatically. You must manually add this setting.
        1. Go to your Render Dashboard.
        2. Navigate to the **Environment** tab.
        3. Add a new Environment Variable:
            - **Key**: `ALLOWED_ORIGINS`
            - **Value**: `https://www.milople.com,https://milople.com`
        4.  **Localhost / Testing**: If you are testing on your local machine (e.g., XAMPP, Docker), you **MUST** add your local URL too!
            - Example: `https://www.milople.com,http://localhost,http://127.0.0.1,http://magento.local`
            - If you don't add your local URL, the chatbot will block your local site.

---

## Method 1: Global Embed (Recommended)
This adds the chatbot to every page of your Magento store.

1.  **Log in** to your Magento Admin Panel.
2.  Go to **Content** > **Design** > **Configuration**.
3.  Select the **Store View** you want to edit (usually the main one) and click **Edit**.
4.  Scroll down to the **HTML Head** or **Footer** section.
    - *Footer* is generally safer for scripts to ensure page load speed isn't affected.
5.  In the **Scripts and Style Sheets** (or "Miscellaneous HTML") text area, paste the following code:
    ```html
    <script 
        src="https://chatbot-widget-ghh8.onrender.com/widget/chat-widget.js"
        data-server-url="https://chatbot-widget-ghh8.onrender.com"
        data-primary-color="#007bff"
        data-bot-name="My Chatbot"
        data-welcome-message="Hello! How can I help you today?">
    </script>
    ```
6.  Click **Save Configuration**.
7.  **Flush Cache**: Go to **System** > **Cache Management** and click **Flush Magento Cache**.

---

## Method 2: Specific Pages or Global via Widgets (Admin Only)
**Use this if "Method 1" gives you a 403 Forbidden Error.**
This method uses Magento's CMS Blocks, which often bypasses the strict Firewall that blocks the main configuration.

### Step 1: Create a CMS Block
1.  Go to **Content** > **Elements** > **Blocks**.
2.  Click **Add New Block**.
3.  **Title**: 'Chatbot Widget'
4.  **Identifier**: `chatbot-widget`
5.  **Store View**: 'All Store Views'
6.  Click **Show / Hide Editor** (ensure you are in raw HTML mode).
7.  **Paste the Script** directly there.
8.  **Save Block**.

### Step 2: Display it via a Widget
1.  Go to **Content** > **Elements** > **Widgets**.
2.  Click **Add Widget**.
3.  **Type**: `CMS Static Block`.
4.  **Design Theme**: Select your current theme.
5.  Click **Continue**.
6.  **Widget Title**: "Chatbot Footer" (Frontend visibility: All Store Views).
7.  **Layout Updates** (Bottom Section):
    -   Click **Add Layout Update**.
    -   Display On: **All Pages** (or Specific Page).
    -   Container: **Main Content Bottom** (or Footer).
8.  Click **Widget Options** (Left Sidebar).
    -   **Block**: Select the 'Chatbot Widget' you created in Step 1.
9.  **Save**.
10. **Flush Cache**.

---

## Method 3: Google Tag Manager (Best for bypassing errors)
If the Magento Admin blocks you from saving the script (403 Error), use Google Tag Manager (GTM).

1.  Go to **Google Tag Manager** container.
2.  Click **Tags** > **New**.
3.  **Tag Configuration**: Select **Custom HTML**.
4.  Paste the chatbot script snippet there.
5.  **Triggering**: Select **All Pages**.
6.  Name the tag (e.g., "AI Chatbot Widget") and **Save**.
7.  **Publish** the container changes.
*This usually bypasses the server security because GTM injects the script dynamically.*

---

## Troubleshooting

### "403 Forbidden" Error
If you see a 403 error, it is likely mostly due to one of two reasons:

#### Scenario A: You see "403 Forbidden" when clicking "SAVE" in Magento Admin
This is **very common**. Your server's security firewall (ModSecurity/WAF) thinks you are trying to hack the site because you are pasting a `<script>` tag.
**Solution:**
1.  **Contact your Hosting Provider**: Ask them to "Whitelist the action of saving script tags in HTML Head configuration."
2.  **Alternative Method**: Use **Method 2 (Widgets)** or **Method 3 (GTM)** above. These often bypass the firewall.

#### Scenario B: You see "403 Forbidden" in the Browser Console (Network Tab)
This means the **Chatbot Server** (Render) is blocking your website.
**Solution:**
1.  Check your **Render Dashboard** > **Environment**.
2.  Look at `ALLOWED_ORIGINS`.
3.  **Ensure your EXACT domain is there.**
    - If your site is `https://www.milople.com`, you MUST have that *exact* string.
    - `https://milople.com` (no www) is DIFFERENT. Add both!
    - Value should look like: `https://www.milople.com,https://milople.com`
