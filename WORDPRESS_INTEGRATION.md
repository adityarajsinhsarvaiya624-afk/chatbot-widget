# WordPress Chatbot Integration Guide

Integrating your AI Chatbot into WordPress is very simple. You can do it in 2 minutes using a free plugin (Recommended) or by editing your theme setup.

## Option 1: The "Insert Headers and Footers" Plugin (Easiest)
This is the safest method because it persists even if you change your theme.

1.  **Install the Plugin**:
    *   Go to your WordPress Admin Dashboard.
    *   Navigate to **Plugins > Add New**.
    *   Search for **"WPCode"** (formerly "Insert Headers and Footers").
    *   Click **Install Now** and then **Activate**.

2.  **Add the Snippet**:
    *   On the left sidebar, find **Code Snippets > Header & Footer**.
    *   Locate the **Body (Footer)** section (sometimes called "Footer" or "Before partials/body closing tag").
    *   Paste your chatbot snippet code there:

    ```html
    <!-- Chatbot Widget -->
    <script 
        src="https://chatbot-widget-ghh8.onrender.com/widget/chat-widget.js"
        data-server-url="https://chatbot-widget-ghh8.onrender.com"
        data-primary-color="#FF5501" 
        data-bot-name="My AI Assistant"
        data-welcome-message="Hi there! How can I help you?">
    </script>
    ```

3.  **Save Changes**:
    *   Click the **Save Changes** button.
    *   Visit your website (refresh the page) and the chat bubble will appear!

---

## Option 2: Editing `functions.php` (For Developers)
If you prefer not to use a plugin, you can add it via your theme's `functions.php` file. **Note:** If you update your theme, this might get overwritten unless you use a Child Theme.

1.  Go to **Appearance > Theme File Editor**.
2.  Select **Theme Functions (functions.php)** from the right sidebar.
3.  Scroll to the very bottom and add this PHP code:

    ```php
    function add_chatbot_widget_footer() {
        ?>
        <script 
            src="https://chatbot-widget-ghh8.onrender.com/widget/chat-widget.js"
            data-server-url="https://chatbot-widget-ghh8.onrender.com"
            data-primary-color="#FF5501" 
            data-bot-name="My AI Assistant"
            data-welcome-message="Hi there! How can I help you?">
        </script>
        <?php
    }
    add_action('wp_footer', 'add_chatbot_widget_footer');
    ```

4.  Click **Update File**.

---

## Troubleshooting

### 1. "I don't see the widget!"
*   **Cache:** If you use a caching plugin like **WP Rocket**, **W3 Total Cache**, or **Autoptimize**, you MUST clear the cache after adding the code.
*   **Logged In vs Logged Out:** Sometimes caching plugins only show changes to "Logged Out" visitors. Check in an Incognito window.

### 2. "It says 'Unable to connect'"
*   Using **WordPress Localhost** (e.g., LocalWP, XAMPP)?
    *   You need to add `http://localhost` (or your local domain) to the **Render Environment Variables** (`ALLOWED_ORIGINS`).
*   Using a **Live Site**?
    *   Ensure your domain (e.g., `https://mysite.com`) is in the `ALLOWED_ORIGINS` list on Render.
