# Advanced Text Editor - Chrome Extension

A powerful and feature-rich text and code editor Chrome extension with cloud storage integration, password protection, and advanced editing capabilities.

## 📝 What is it?

Advanced Text Editor is a Chrome browser extension that provides a comprehensive text and code editing experience directly in your browser. It's designed for writers, developers, and anyone who needs a reliable, feature-packed text editor with cloud backup capabilities.

## ✨ Features

### 📄 Text Editing
- **Rich Text Formatting**: Bold, italic, and underline text formatting
- **List Support**: Bullet points and numbered lists
- **Multiple Fonts**: Choose from various font families (Segoe UI, Roboto, Playfair, Montserrat, Poppins, Courier, Georgia)
- **Word & Character Count**: Real-time word and character counting

### 💻 Code Mode
- **Syntax Highlighting**: Full syntax highlighting for JavaScript, Python, CSS, XML, and more
- **Line Numbers**: Easy code navigation with line numbers
- **Theme-Aware Colors**: 
  - Light theme: Dark code editor (Monokai theme)
  - Dark theme: Light code editor (Default theme)
- **Code-Friendly Features**: Tab indentation, line wrapping, and more

### 🗂️ Tab Management
- **Multiple Tabs**: Work on multiple documents simultaneously
- **Tab Switching**: Easy navigation between different documents
- **Tab History**: Restore accidentally closed tabs (Ctrl+Z or Ctrl+Shift+Z)

### 🎨 Themes
- **Light Mode**: Clean, bright interface
- **Dark Mode**: Easy on the eyes for extended use
- **Auto-Save**: Automatic saving of your work

### 🔒 Security
- **Password Protection**: Lock your editor with a password
- **Secure Storage**: Your documents are stored locally in Chrome's secure storage
- **Encrypted Cloud Tokens**: GitHub tokens are encrypted before storage

### ☁️ Cloud Storage
- **GitHub Gist Integration**: Save your documents to GitHub Gists
- **Pastebin Support**: Quick sharing via Pastebin
- **Secure Token Storage**: Encrypted GitHub token storage

### 💾 Export Options
- **Multiple Formats**: Download as TXT, PDF, HTML, Markdown, or RTF
- **Custom Filenames**: Name your files as you like

### 🎯 Additional Features
- **Auto-Save**: Your work is automatically saved as you type
- **Draft Persistence**: Content is saved even when the extension is closed
- **Keyboard Shortcuts**: 
  - `Ctrl+B` / `Cmd+B`: Bold
  - `Ctrl+I` / `Cmd+I`: Italic
  - `Ctrl+U` / `Cmd+U`: Underline
  - `Ctrl+S` / `Cmd+S`: Manual save
  - `Ctrl+Z` / `Cmd+Z`: Restore closed tab

## 🚀 Installation

### Method 1: Load Unpacked Extension (For Development)

1. **Download or Clone the Repository**
   ```bash
   git clone <repository-url>
   cd extention_GoogleChrome_TextEditor
   ```

2. **Open Chrome Extensions Page**
   - Open Google Chrome
   - Navigate to `chrome://extensions/`
   - Or go to Menu (⋮) → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the Extension**
   - Click "Load unpacked"
   - Select the `extention_GoogleChrome_TextEditor` folder
   - The extension should now appear in your extensions list

5. **Pin the Extension (Optional)**
   - Click the puzzle icon (🧩) in Chrome's toolbar
   - Find "Advanced Text Editor" and click the pin icon to keep it visible

### Method 2: Package and Install (For Distribution)

1. **Package the Extension**
   - Go to `chrome://extensions/`
   - Enable Developer mode
   - Click "Pack extension"
   - Select the extension directory
   - This creates a `.crx` file

2. **Install the Packaged Extension**
   - Drag and drop the `.crx` file onto the `chrome://extensions/` page
   - Confirm the installation

## 📋 Requirements

- **Google Chrome** (version 88 or higher)
- **Chrome Extensions API** support
- **Internet Connection** (for cloud storage features)

## 🎮 Usage

1. **Open the Editor**: Click the extension icon in your Chrome toolbar
2. **Start Writing**: Begin typing in the editor
3. **Switch Modes**: Click the 📝/💻 button to toggle between text and code mode
4. **Format Text**: Use the toolbar buttons or keyboard shortcuts
5. **Save to Cloud**: Click the ☁️ button to save to GitHub Gist or Pastebin
6. **Lock Editor**: Click the 🔒 button to password-protect your editor
7. **Download**: Click the 💾 button to download in various formats

## 🔧 Configuration

### GitHub Gist Setup

1. Generate a GitHub Personal Access Token:
   - Go to [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
   - Click "Generate new token (classic)"
   - Select the `gist` scope
   - Copy the token

2. In the extension:
   - Click the ☁️ button
   - Click "🐙 GitHub Gist"
   - Enter your token when prompted
   - Your token is encrypted and stored securely

## 📁 Project Structure

```
extention_GoogleChrome_TextEditor/
├── manifest.json          # Extension manifest
├── popup.html             # Main UI
├── editor.js              # Core editor logic
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── lib/                   # Third-party libraries
    ├── codemirror.min.js  # Code editor
    ├── crypto-js.min.js   # Encryption
    ├── jspdf.umd.min.js   # PDF generation
    └── ...
```

## 🛠️ Technologies Used

- **Vanilla JavaScript**: Core functionality
- **CodeMirror**: Code editing and syntax highlighting
- **CryptoJS**: Encryption for secure token storage
- **jsPDF**: PDF generation
- **Chrome Extensions API**: Browser integration

## 📝 License

This project is open source and available for use and modification.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

## 📧 Support

For issues, questions, or suggestions, please open an issue on the GitHub repository.

---

**Made with ❤️ for developers and writers**
