// Settings management
const SETTINGS_KEY = 'journeybook-settings';
// Process image with API to get description and create .pwq file
async function processImageWithApi(imagePath, imageName, apiUrl, apiKey) {
  try {
    // Get language for the prompt
    const settings = loadSettings();
    const language = settings.language || 'zh-CN';

    // Create prompt based on language
    let prompt;
    if (language === 'zh-CN') {
      prompt = '扫描这张图片，用一段话详细描述这张图片，最后结尾不要有句号';
    } else {
      prompt = 'Scan this image and provide a detailed description in one paragraph. Do not end with a period';
    }

    // Show processing status
    const addBtn = document.getElementById('addImageBtn');
    const originalText = addBtn.textContent;
    addBtn.textContent = t('messages.processing_image') || '...';

    // Call API to analyze image through main process
    const result = await ipcRenderer.invoke('analyze-image-with-api', {
      imagePath,
      apiUrl,
      apiKey,
      prompt
    });

    // Reset button
    addBtn.textContent = originalText;

    if (!result.success) {
      throw new Error(result.error || t('messages.image_analysis_failed'));
    }

    const description = result.description;
    if (!description) {
      throw new Error(t('messages.no_valid_description'));
    }

    // Create sanitized filename
    const sanitizedName = description
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_') // Keep alphanumeric and Chinese characters
      .replace(/_{2,}/g, '_') // Replace multiple underscores with a single one
      .substring(0, 100) // Limit length
      .toLowerCase() + '.pwq';

    // Ensure search directory exists
    const searchDir = path.join(__dirname, 'search');
    if (!fs.existsSync(searchDir)) {
      fs.mkdirSync(searchDir);
    }

    // Write the .pwq file
    const pwqPath = path.join(searchDir, sanitizedName);
    fs.writeFileSync(pwqPath, imageName, 'utf8');

    console.log(`Created search file: ${sanitizedName}`);

    return true;
  } catch (error) {
    console.error('Failed to process image with API:', error);
    return false;
  }
}
// Default settings
const defaultSettings = {
  theme: 'light',
  language: 'zh-CN',
  apiUrl: '',
  apiKey: ''
};

// i18n management
let currentTranslations = {};

// Load translations for a specific language
async function loadTranslations(language) {
  try {
    const response = await fetch(`./locales/${language}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load translations for ${language}`);
    }
    currentTranslations = await response.json();
    return currentTranslations;
  } catch (error) {
    console.error('Failed to load translations:', error);
    // Fallback to Chinese if loading fails
    if (language !== 'zh-CN') {
      return loadTranslations('zh-CN');
    }
    return {};
  }
}

// Get translation by key (supports nested keys like 'app.title')
function t(key) {
  const keys = key.split('.');
  let value = currentTranslations;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      console.warn(`Translation key not found: ${key}`);
      return key; // Return the key itself if translation not found
    }
  }
  
  return value;
}

// Apply translations to the UI
function applyTranslations() {
  // Update document title
  document.title = t('app.title');
  
  // Update menu items
  const imagesMenuItem = document.querySelector('[data-tab="images"]');
  const settingsMenuItem = document.querySelector('[data-tab="settings"]');
  if (imagesMenuItem) imagesMenuItem.textContent = t('menu.images');
  if (settingsMenuItem) settingsMenuItem.textContent = t('menu.settings');
  
  // Update settings page
  const settingsTitle = document.querySelector('#settings-tab h2');
  if (settingsTitle) settingsTitle.textContent = t('settings.title');
  
  // Update labels
  const labels = {
    'theme-toggle': 'settings.theme',
    'language-select': 'settings.language',
    'api-url': 'settings.api_url',
    'api-key': 'settings.api_key'
  };
  
  Object.entries(labels).forEach(([id, key]) => {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) label.textContent = t(key);
  });
  
  // Update select options
  const themeSelect = document.getElementById('theme-toggle');
  if (themeSelect) {
    themeSelect.options[0].textContent = t('settings.theme_light');
    themeSelect.options[1].textContent = t('settings.theme_dark');
  }
  
  const languageSelect = document.getElementById('language-select');
  if (languageSelect) {
    languageSelect.options[0].textContent = t('settings.language_zh');
    languageSelect.options[1].textContent = t('settings.language_en');
  }
  
  // Update placeholders
  const apiUrlInput = document.getElementById('api-url');
  const apiKeyInput = document.getElementById('api-key');
  if (apiUrlInput) apiUrlInput.placeholder = t('settings.api_url_placeholder');
  if (apiKeyInput) apiKeyInput.placeholder = t('settings.api_key_placeholder');
  
  // Update save button
  const saveBtn = document.getElementById('save-settings');
  if (saveBtn) saveBtn.textContent = t('settings.save');

  // 更新搜索相关翻译
  setupSearchTranslations();
}

// 设置搜索相关的翻译
function setupSearchTranslations() {
  const searchInput = document.getElementById('search-input');
  const searchType = document.getElementById('search-type');
  const searchButton = document.getElementById('search-button');

  if (searchInput) {
    searchInput.placeholder = t('messages.search_placeholder');
  }

  if (searchType) {
    if (searchType.options.length >= 2) {
      searchType.options[0].textContent = t('messages.filename_search');
      searchType.options[1].textContent = t('messages.description_search');
    }
  }

  if (searchButton) {
    searchButton.textContent = t('messages.search_button');
  }
}

// 初始化搜索功能
function initializeSearch() {
  const searchInput = document.getElementById('search-input');
  const searchType = document.getElementById('search-type');
  const searchButton = document.getElementById('search-button');

  if (!searchInput || !searchType || !searchButton) {
    return;
  }

  // 搜索按钮点击事件
  searchButton.addEventListener('click', async () => {
    performSearch();
  });

  // 输入框回车键事件
  searchInput.addEventListener('keyup', async (event) => {
    if (event.key === 'Enter') {
      performSearch();
    }
  });

  // 搜索类型切换时自动搜索
  searchType.addEventListener('change', async () => {
    if (searchInput.value.trim()) {
      performSearch();
    }
  });
}

// 执行搜索
async function performSearch() {
  const searchInput = document.getElementById('search-input');
  const searchType = document.getElementById('search-type');

  const query = searchInput.value.trim();
  const type = searchType.value;

  let results = [];

  if (type === 'filename') {
    // 文件名搜索
    results = searchByFilename(query);
  } else if (type === 'description') {
    // 描述搜索
    results = await searchByDescription(query);
  }

  // 显示搜索结果
  renderGallery(results);
}

// Load settings from localStorage
function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  } catch (error) {
    console.error('Failed to load settings:', error);
    return defaultSettings;
  }
}

// Save settings to localStorage
function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.error('Failed to save settings:', error);
    return false;
  }
}

// Apply settings to UI
function applySettings(settings) {
  // Apply theme
  if (settings.theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
  
  // Update form values
  document.getElementById('theme-toggle').value = settings.theme;
  document.getElementById('language-select').value = settings.language;
  document.getElementById('api-url').value = settings.apiUrl;
  document.getElementById('api-key').value = settings.apiKey;
}

// Tab switching functionality
function switchTab(tabName) {
  // Remove active class from all menu items
  document.querySelectorAll('.menu-item').forEach(item => {
    item.classList.remove('active');
  });
  
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // Activate selected tab
  const menuItem = document.querySelector(`[data-tab="${tabName}"]`);
  const tabContent = document.getElementById(`${tabName}-tab`);
  
  if (menuItem && tabContent) {
    menuItem.classList.add('active');
    tabContent.classList.add('active');
  }
}

// Initialize settings and i18n
document.addEventListener('DOMContentLoaded', async () => {
  const settings = loadSettings();
  
  // Load translations first
  await loadTranslations(settings.language);
  
  // Apply settings and translations
  applySettings(settings);
  applyTranslations();

  // 设置搜索相关的翻译
  setupSearchTranslations();

  // 初始化搜索功能
  initializeSearch();
});

// Menu item click handlers
document.querySelectorAll('.menu-item').forEach(item => {
  item.addEventListener('click', () => {
    const tabName = item.getAttribute('data-tab');
    switchTab(tabName);
  });
});

// Settings event listeners
document.getElementById('theme-toggle').addEventListener('change', function (event) {
  const settings = loadSettings();
  settings.theme = event.target.value;
  
  if (event.target.value === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
  
  saveSettings(settings);
});

document.getElementById('language-select').addEventListener('change', async function (event) {
  const settings = loadSettings();
  settings.language = event.target.value;
  saveSettings(settings);
  
  // Load and apply new translations
  await loadTranslations(settings.language);
  applyTranslations();
});

document.getElementById('api-url').addEventListener('input', function (event) {
  const settings = loadSettings();
  settings.apiUrl = event.target.value;
  saveSettings(settings);
});

document.getElementById('api-key').addEventListener('input', function (event) {
  const settings = loadSettings();
  settings.apiKey = event.target.value;
  saveSettings(settings);
});

// Save settings button
document.getElementById('save-settings').addEventListener('click', function () {
  const settings = {
    theme: document.getElementById('theme-toggle').value,
    language: document.getElementById('language-select').value,
    apiUrl: document.getElementById('api-url').value,
    apiKey: document.getElementById('api-key').value
  };
  
  if (saveSettings(settings)) {
    // Show success feedback
    const btn = this;
    const originalText = btn.textContent;
    btn.textContent = t('settings.saved');
    btn.style.background = '#28a745';
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
    }, 2000);
  }
});const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');

const gallery = document.getElementById('gallery');
const fullscreenOverlay = document.getElementById('fullscreenOverlay');
const fullscreenImage = document.getElementById('fullscreenImage');

const IMG_DIR = 'img';
const SCAN_INTERVAL = 100; // 0.1秒

let currentImages = [];

// 检查并加载图片
function loadImages() {
  if (!fs.existsSync(IMG_DIR)) {
    fs.mkdirSync(IMG_DIR);
    return;
  }

  const files = fs.readdirSync(IMG_DIR)
    .filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file));

  // 如果图片没有变化则返回
  if (files.length === currentImages.length && 
      files.every((file, i) => file === currentImages[i])) {
    return;
  }

  currentImages = files;

  // 重置搜索框
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.value = '';
  }

  renderGallery();
}

// 渲染图片网格 - 现在支持过滤显示
function renderGallery(imagesToShow = null) {
  gallery.innerHTML = '';

  // 使用所有图片或过滤后的图片列表
  const imagesToRender = imagesToShow || currentImages;

  // 如果没有图片显示提示
  if (imagesToRender.length === 0) {
    const noResults = document.createElement('div');
    noResults.className = 'no-results';
    noResults.textContent = t('messages.no_results');
    gallery.appendChild(noResults);
    return;
  }

  // 渲染图片
  imagesToRender.forEach(file => {
    const imgPath = path.join(IMG_DIR, file);
    const imgUrl = `file://${path.resolve(imgPath)}`;

    const thumbContainer = document.createElement('div');
    thumbContainer.className = 'thumb-container';

    const img = document.createElement('img');
    img.className = 'thumbnail';
    img.src = imgUrl;
    img.alt = file;

    img.addEventListener('click', () => {
      fullscreenImage.src = imgUrl;
      fullscreenOverlay.style.display = 'flex';
    });

    thumbContainer.appendChild(img);
    gallery.appendChild(thumbContainer);
  });
}

// 文件名搜索函数
function searchByFilename(query) {
  if (!query.trim()) {
    return currentImages; // 如果搜索为空，返回所有图片
  }

  // 转为小写进行不区分大小写的搜索
  const queryLower = query.toLowerCase();

  return currentImages.filter(filename => 
    filename.toLowerCase().includes(queryLower)
  );
}

// 描述搜索函数 - 查找包含描述的 .pwq 文件
async function searchByDescription(query) {
  if (!query.trim()) {
    return currentImages; // 如果搜索为空，返回所有图片
  }

  try {
    const searchDir = path.join(__dirname, 'search');
    if (!fs.existsSync(searchDir)) {
      return [];
    }

    // 读取所有 .pwq 文件
    const pwqFiles = fs.readdirSync(searchDir)
      .filter(file => file.endsWith('.pwq'));

    // 搜索的图片文件名集合
    const matchedImageFiles = new Set();

    // 转为小写进行不区分大小写的搜索
    const queryLower = query.toLowerCase();

    // 检查每个 .pwq 文件名是否包含搜索词
    pwqFiles.forEach(pwqFile => {
      if (pwqFile.toLowerCase().includes(queryLower)) {
        // 如果文件名匹配，读取其内容获取图片文件名
        const pwqPath = path.join(searchDir, pwqFile);
        const imageFileName = fs.readFileSync(pwqPath, 'utf8').trim();

        // 检查图片是否存在
        const imgPath = path.join(IMG_DIR, imageFileName);
        if (fs.existsSync(imgPath)) {
          matchedImageFiles.add(imageFileName);
        }
      }
    });

    return Array.from(matchedImageFiles);
  } catch (error) {
    console.error('搜索描述时出错:', error);
    return [];
  }
}

// 点击空白处退出全屏
fullscreenOverlay.addEventListener('click', (e) => {
  if (e.target === fullscreenOverlay) {
    fullscreenOverlay.style.display = 'none';
  }
});

// 添加图片按钮功能
document.getElementById('addImageBtn').addEventListener('click', async () => {
  try {
    // Get current settings for API URL and key
    const settings = loadSettings();

    // Open file dialog to select images
    const { filePaths } = await ipcRenderer.invoke('open-file-dialog', {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif'] }
      ]
    });

    if (filePaths && filePaths.length > 0) {
      // Check if API is configured
      if (settings.apiUrl && settings.apiKey) {
        // Process images one by one
        for (const filePath of filePaths) {
          const fileName = path.basename(filePath);
          const destPath = path.join(IMG_DIR, fileName);

          // Copy the image file
          fs.copyFileSync(filePath, destPath);

          // Process with API
          await processImageWithApi(destPath, fileName, settings.apiUrl, settings.apiKey);
        }
      } else {
        // No API configured, just copy the files
        filePaths.forEach(filePath => {
          const fileName = path.basename(filePath);
          const destPath = path.join(IMG_DIR, fileName);

          fs.copyFileSync(filePath, destPath);
        });
      }
      
      loadImages();
    }
  } catch (error) {
    console.error(t('messages.import_failed'), error);
  }
});

// 从API获取图片
async function getImageFromApi(apiUrl, apiKey) {
  try {
    // Show loading feedback
    const addBtn = document.getElementById('addImageBtn');
    const originalText = addBtn.textContent;
    addBtn.textContent = '...';

    // Get a prompt from user
    const prompt = prompt(t('messages.enter_prompt') || 'Enter a prompt for image generation') || 'Generate an image';

    // Use main process to handle API request and image download
    const result = await ipcRenderer.invoke('download-image-from-api', {
      url: prompt,
      apiUrl, 
      apiKey
    });

    // Process the result
    if (result.success) {
      // Reset button and return success
      addBtn.textContent = originalText;
      return true;
    } else {
      throw new Error(result.error || t('messages.api_no_image'));
    }
  } catch (error) {
    console.error('Failed to get image from API:', error);
    alert(`Failed to get image from API: ${error.message}`);
    return false;
  }
}

// 添加搜索快捷键 (Ctrl+F)
document.addEventListener('keydown', (event) => {
  // 如果是Ctrl+F且当前在图片标签页
  if ((event.ctrlKey || event.metaKey) && event.key === 'f' && 
      document.querySelector('[data-tab="images"]').classList.contains('active')) {
    event.preventDefault(); // 阻止浏览器默认搜索

    // 聚焦到搜索框
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.focus();
      searchInput.select(); // 选中已有内容
    }
  }
});

// 定期检查图片更新
setInterval(loadImages, SCAN_INTERVAL);
loadImages();