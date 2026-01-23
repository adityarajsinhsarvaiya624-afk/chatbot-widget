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
        4. This ensures NO ONE else can use your paid AI credits on their site.

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

## Method 2: Specific Pages (CMS Blocks/Widgets)
If you only want the chatbot on specific pages (e.g., Support page).

1.  Go to **Content** > **Elements** > **Blocks** (or Pages).
2.  Add a new Block or Edit an existing one.
3.  Show / Hide Editor to work with raw HTML.
4.  Paste the script snippet from above.
5.  Save and Cache Flush.
