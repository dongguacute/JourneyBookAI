const fs = require('fs');
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
  renderGallery();
}

// 渲染图片网格
function renderGallery() {
  gallery.innerHTML = '';
  
  currentImages.forEach(file => {
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

// 点击空白处退出全屏
fullscreenOverlay.addEventListener('click', (e) => {
  if (e.target === fullscreenOverlay) {
    fullscreenOverlay.style.display = 'none';
  }
});

// 添加图片按钮功能
document.getElementById('addImageBtn').addEventListener('click', async () => {
  try {
    const { filePaths } = await ipcRenderer.invoke('open-file-dialog', {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif'] }
      ]
    });

    if (filePaths && filePaths.length > 0) {
      filePaths.forEach(filePath => {
        const fileName = path.basename(filePath);
        const destPath = path.join(IMG_DIR, fileName);
        
        fs.copyFileSync(filePath, destPath);
      });
      
      loadImages();
    }
  } catch (error) {
    console.error('导入图片失败:', error);
  }
});

// 定期检查图片更新
setInterval(loadImages, SCAN_INTERVAL);
loadImages();