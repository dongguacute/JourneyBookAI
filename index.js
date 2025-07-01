const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const fs = require('fs');
const path = require('path'); // Correctly importing the path module
const https = require('https');
const http = require('http');

const imageDir = path.join(__dirname, 'img'); // Image directory
const searchDir = path.join(__dirname, 'search'); // Directory for .pwq files

// Ensure directories exist
if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir);
}

if (!fs.existsSync(searchDir)) {
  fs.mkdirSync(searchDir);
}

ipcMain.handle('import-image', async (event, options) => {
  const result = await dialog.showOpenDialog({
    properties: options.multiSelections ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, reason: 'canceled' };
  }

  return { success: true, filePaths: result.filePaths };
});

async function promptForDescription() {
  // Simple dialog prompt for description (needs to be replaced with an actual dialog in a real app)
  return "這是圖片的描述"; // Mock return as placeholder
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('open-file-dialog', async (event, options) => {
  return await dialog.showOpenDialog(options);
});

ipcMain.handle('analyze-image-with-api', async (event, { imagePath, apiUrl, apiKey, prompt }) => {
  try {
    // Read the image file as base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // Make API request to analyze image
    const analysisResult = await new Promise((resolve, reject) => {
      const apiUrlObj = new URL(apiUrl);
      const options = {
        hostname: apiUrlObj.hostname,
        port: apiUrlObj.port || (apiUrlObj.protocol === 'https:' ? 443 : 80),
        path: apiUrlObj.pathname + apiUrlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      };

      const req = (apiUrlObj.protocol === 'https:' ? https : http).request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`API request failed with status code ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);

      // Send request with image data
      const requestBody = JSON.stringify({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { 
                type: 'image_url', 
                image_url: { 
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 300
      });

      req.write(requestBody);
      req.end();
    });

    // Extract description from response
    const description = analysisResult.choices && 
                        analysisResult.choices[0] && 
                        analysisResult.choices[0].message && 
                        analysisResult.choices[0].message.content ? 
                        analysisResult.choices[0].message.content.trim() : '';

    if (!description) {
      return { success: false, error: 'No valid description received' };
    }

    return { success: true, description };
  } catch (error) {
    console.error('Failed to analyze image with API:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-image-from-api', async (event, { url, apiUrl, apiKey }) => {
  try {
    // Make API request to get image URL
    const imageData = await new Promise((resolve, reject) => {
      const apiUrlObj = new URL(apiUrl);
      const options = {
        hostname: apiUrlObj.hostname,
        port: apiUrlObj.port || (apiUrlObj.protocol === 'https:' ? 443 : 80),
        path: apiUrlObj.pathname + apiUrlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      };

      const req = (apiUrlObj.protocol === 'https:' ? https : http).request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`API request failed with status code ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify({ prompt: url, n: 1, size: '1024x1024' }));
      req.end();
    });

    // Process the API response
    if (imageData.data && imageData.data[0] && imageData.data[0].url) {
      const imageUrl = imageData.data[0].url;

      // Download the image
      const imageBinary = await new Promise((resolve, reject) => {
        const imageUrlObj = new URL(imageUrl);
        const options = {
          hostname: imageUrlObj.hostname,
          port: imageUrlObj.port || (imageUrlObj.protocol === 'https:' ? 443 : 80),
          path: imageUrlObj.pathname + imageUrlObj.search,
          method: 'GET'
        };

        const req = (imageUrlObj.protocol === 'https:' ? https : http).request(options, (res) => {
          const chunks = [];
          res.on('data', (chunk) => {
            chunks.push(chunk);
          });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(Buffer.concat(chunks));
            } else {
              reject(new Error(`Image download failed with status code ${res.statusCode}`));
            }
          });
        });

        req.on('error', reject);
        req.end();
      });

      // Generate unique filename
      const timestamp = new Date().getTime();
      const fileName = `api_image_${timestamp}.png`;
      const filePath = path.join(imageDir, fileName);

      // Save the image
      fs.writeFileSync(filePath, imageBinary);

      return { success: true, fileName };
    } else {
      return { success: false, error: 'API response did not contain image data' };
    }
  } catch (error) {
    console.error('Failed to download image from API:', error);
    return { success: false, error: error.message };
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
