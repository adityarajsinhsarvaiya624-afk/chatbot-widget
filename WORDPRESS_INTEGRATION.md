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

## Option 3: Using the Site Editor (For Block Themes)
If you are using a modern "Block Theme" (like Twenty Twenty-Two/Three/Four) and see the **Site Editor** (as shown in your screenshot), follow these steps:

1.  **Open the Site Editor**:
    *   Go to **Appearance > Editor**.
    *   Click on **Patterns** or **Template Parts**, then select **Header**.
    *   Or, if you are already in the editor, simply click on the Header area.

2.  **Add a "Custom HTML" Block**:
    *   Click the **+ (Plus)** button to add a new block inside the Header.
    *   Search for **"Custom HTML"**.
    *   Select the block to insert it.

3.  **Paste the Snippet**:
    *   Paste your chatbot snippet code into the box:

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

4.  **Save**:
    *   Click **Save** in the top right corner.
    *   This will apply the chatbot to every page that uses this Header!

---


## Troubleshooting

### 1. "I don't see the widget!"
*   **Cache:** If you use a caching plugin like **WP Rocket**, **W3 Total Cache**, or **Autoptimize**, you MUST clear the cache after adding the code.
*   **Logged In vs Logged Out:** Sometimes caching plugins only show changes to "Logged Out" visitors. Check in an Incognito window.

### 2. "It says 'Unable to connect'"
*   Using **WordPress Localhost** (e.g., LocalWP, XAMPP)?
    *   You need to add `http://localhost`, `http://chatbot.local` (or your specific local domain) to the **Render Environment Variables** (`ALLOWED_ORIGINS`).
*   Using a **Live Site**?
    *   Ensure your domain (e.g., `https://mysite.com`) is in the `ALLOWED_ORIGINS` list on Render.

---

## 🛑 Don't have a WordPress site to test on?
If you want to check if this works but don't have a website, you can use a free "Sandbox" WordPress site. These expire after a few hours or days but are perfect for testing.

### Recommended Platforms:
1.  **[InstaWP](https://instawp.com)** (Best Alternative)
    *   Click "Get Started", sign up for free, and create a "New Site" instantly.
    *   Very reliable and gives you 48 hours for free.
2.  **[WPSandbox](https://wpsandbox.net)** (No Signup)
    *   Click "Create free dev site" to get a temporary site immediately.
3.  **[TasteWP](https://tastewp.com)**
    *   *Note: Currently under maintenance/upgrade.* Keep this as a backup option for later.

**How to use them:**
1.  Create a temporary site using one of the links above.
2.  Go to the Admin Dashboard (they usually log you in automatically).
3.  Follow **Option 1** above (install the "WPCode" plugin and paste your script).
4.  Open the homepage to see your chatbot in action!
    