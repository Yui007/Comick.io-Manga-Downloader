// Default delay settings
const DEFAULT_SETTINGS = {
  pageLoadDelay: 10,    // seconds
  imageDelay: 2,        // seconds
  chapterDelay: 10      // seconds
};

// Initialize popup based on current page
document.addEventListener('DOMContentLoaded', async () => {
  const statusDiv = document.getElementById('status');
  const singleChapterMode = document.getElementById('singleChapterMode');
  const batchMode = document.getElementById('batchMode');
  
  // Load saved settings
  loadSettings();
  
  // Setup settings toggle
  document.getElementById('toggleSettings').addEventListener('click', function() {
    const settingsDiv = document.getElementById('advancedSettings');
    const isVisible = settingsDiv.style.display !== 'none';
    
    settingsDiv.style.display = isVisible ? 'none' : 'block';
    this.textContent = isVisible ? 'Show Advanced Settings' : 'Hide Advanced Settings';
  });
  
  // Setup save settings button
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if we're on a manga main page or chapter page
    const isMainPage = tab.url.match(/\/comic\/[^\/]+$/);
    
    if (isMainPage) {
      // We're on a manga main page - show batch download UI
      singleChapterMode.style.display = 'none';
      batchMode.style.display = 'block';
      
      // Get manga info and available chapters
      const mangaInfoResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: getMangaInfoFromMainPage
      });
      
      const mangaInfo = mangaInfoResult[0].result;
      document.getElementById('mangaInfo').textContent = `Manga: ${mangaInfo.title}`;
      
      // Show chapter selector
      document.getElementById('chapterSelector').style.display = 'block';
      
      // Set max chapter number
      const maxChapter = mangaInfo.maxChapter || 1000;
      document.getElementById('fromChapter').max = maxChapter;
      document.getElementById('toChapter').max = maxChapter;
      document.getElementById('toChapter').value = maxChapter;
      document.getElementById('fromChapter').value = 1;
      
      // Check if a download is already in progress
      checkDownloadStatus(statusDiv);
    }
  } catch (error) {
    statusDiv.textContent = `Error: ${error.message}`;
  }
});

// Load settings from storage
function loadSettings() {
  chrome.storage.local.get('delaySettings', function(result) {
    const settings = result.delaySettings || DEFAULT_SETTINGS;
    
    document.getElementById('pageLoadDelay').value = settings.pageLoadDelay;
    document.getElementById('imageDelay').value = settings.imageDelay;
    document.getElementById('chapterDelay').value = settings.chapterDelay;
  });
}

// Save settings to storage
function saveSettings() {
  const settings = {
    pageLoadDelay: parseFloat(document.getElementById('pageLoadDelay').value) || DEFAULT_SETTINGS.pageLoadDelay,
    imageDelay: parseFloat(document.getElementById('imageDelay').value) || DEFAULT_SETTINGS.imageDelay,
    chapterDelay: parseFloat(document.getElementById('chapterDelay').value) || DEFAULT_SETTINGS.chapterDelay
  };
  
  chrome.storage.local.set({ delaySettings: settings }, function() {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = 'Settings saved!';
    
    // Clear status after 2 seconds
    setTimeout(() => {
      if (statusDiv.textContent === 'Settings saved!') {
        statusDiv.textContent = '';
      }
    }, 2000);
  });
}

// Check download status periodically
async function checkDownloadStatus(statusDiv) {
  try {
    const status = await chrome.runtime.sendMessage({ action: "getDownloadStatus" });
    
    if (status.isDownloading) {
      statusDiv.textContent = `Downloading chapter ${status.currentChapter}/${status.totalChapters} (${status.progress}%)`;
      
      // Check again in 2 seconds
      setTimeout(() => checkDownloadStatus(statusDiv), 2000);
    }
  } catch (error) {
    console.error("Error checking download status:", error);
  }
}

// Single chapter download
document.getElementById('downloadBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = 'Starting download...';
  
  try {
    // Execute script in the active tab to get image URLs
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Extract manga info from URL
    const mangaInfoFromUrl = extractMangaInfoFromUrl(tab.url);
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: getImageUrls
    });
    
    const imageUrls = results[0].result;
    
    if (!imageUrls || imageUrls.length === 0) {
      statusDiv.textContent = 'No images found. Make sure you are on a comick.io chapter page.';
      return;
    }
    
    // Get manga and chapter info from page content as backup
    const mangaInfo = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: getMangaInfo
    });
    
    // Use URL info if available, otherwise fall back to page content info
    const mangaTitle = mangaInfoFromUrl.mangaTitle || mangaInfo[0].result.mangaTitle;
    const chapterNumber = mangaInfoFromUrl.chapterNumber || mangaInfo[0].result.chapterNumber;
    
    await downloadChapterImages(imageUrls, mangaTitle, chapterNumber, statusDiv);
  } catch (error) {
    statusDiv.textContent = `Error: ${error.message}`;
  }
});

// Batch download
document.getElementById('downloadBatchBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = 'Preparing batch download...';
  
  try {
    const fromChapter = parseFloat(document.getElementById('fromChapter').value);
    const toChapter = parseFloat(document.getElementById('toChapter').value);
    
    if (isNaN(fromChapter) || isNaN(toChapter) || fromChapter > toChapter) {
      statusDiv.textContent = 'Please enter valid chapter numbers.';
      return;
    }
    
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Get manga info
    const mangaInfoResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: getMangaInfoFromMainPage
    });
    
    const mangaInfo = mangaInfoResult[0].result;
    
    // Get chapter URLs
    const chaptersResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: getChapterUrls
    });
    
    const chapterUrls = chaptersResult[0].result;
    
    // Filter chapters in the selected range
    const selectedChapters = chapterUrls.filter(chapter => {
      return chapter.number >= fromChapter && chapter.number <= toChapter;
    });
    
    if (selectedChapters.length === 0) {
      statusDiv.textContent = 'No chapters found in the selected range.';
      return;
    }
    
    // Get current delay settings
    const settings = await new Promise(resolve => {
      chrome.storage.local.get('delaySettings', function(result) {
        resolve(result.delaySettings || DEFAULT_SETTINGS);
      });
    });
    
    statusDiv.textContent = `Found ${selectedChapters.length} chapters. Starting download...`;
    
    // Send the download request to the background script
    const response = await chrome.runtime.sendMessage({
      action: "startBatchDownload",
      data: {
        mangaInfo,
        selectedChapters,
        settings
      }
    });
    
    if (response.success) {
      statusDiv.textContent = `Download started in background. You can close this popup.`;
      
      // Start checking status
      setTimeout(() => checkDownloadStatus(statusDiv), 2000);
    }
  } catch (error) {
    statusDiv.textContent = `Error: ${error.message}`;
    console.error('Batch download error:', error);
  }
});

// Function to download chapter images
async function downloadChapterImages(imageUrls, mangaTitle, chapterNumber, statusDiv) {
  // Sanitize manga title and chapter number for valid filenames
  const sanitizedTitle = sanitizeFilename(mangaTitle);
  const sanitizedChapter = sanitizeFilename(chapterNumber.toString());
  
  // Create folder path for the manga chapter
  const folderPath = `Manga/${sanitizedTitle}/Chapter ${sanitizedChapter}/`;
  
  // Download each image
  statusDiv.textContent = `Downloading ${imageUrls.length} images for Chapter ${chapterNumber}...`;
  
  let successCount = 0;
  
  for (let i = 0; i < imageUrls.length; i++) {
    const paddedIndex = String(i + 1).padStart(3, '0');
    
    // Detect file extension from URL or default to jpg
    let extension = 'jpg';
    const urlMatch = imageUrls[i].match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    if (urlMatch && urlMatch[1]) {
      const detectedExt = urlMatch[1].toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(detectedExt)) {
        extension = detectedExt;
      }
    }
    
    const filename = `${folderPath}${paddedIndex}.${extension}`;
    
    try {
      // Download the image and wait for it to complete
      const downloadId = await new Promise((resolve, reject) => {
        chrome.downloads.download({
          url: imageUrls[i],
          filename: filename,
          saveAs: false // Never ask for location
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(downloadId);
          }
        });
      });
      
      // Wait for download to complete
      if (downloadId) {
        await new Promise((resolve) => {
          const listener = chrome.downloads.onChanged.addListener((delta) => {
            if (delta.id === downloadId && delta.state && 
                (delta.state.current === 'complete' || delta.state.current === 'interrupted')) {
              chrome.downloads.onChanged.removeListener(listener);
              resolve();
            }
          });
          
          // Set a timeout in case the download hangs
          setTimeout(() => {
            chrome.downloads.onChanged.removeListener(listener);
            resolve();
          }, 30000); // 30 second timeout
        });
        
        successCount++;
      }
      
      // Add a larger delay between downloads (increased to 2 seconds)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Update status every few images
      if (i % 3 === 0 || i === imageUrls.length - 1) {
        statusDiv.textContent = `Downloading Chapter ${chapterNumber}: ${i+1}/${imageUrls.length} images...`;
      }
    } catch (error) {
      console.error(`Error downloading image ${i+1}:`, error);
      // Continue with next image instead of stopping the whole process
    }
  }
  
  statusDiv.textContent = `Completed Chapter ${chapterNumber}: ${successCount}/${imageUrls.length} images downloaded`;
  return successCount;
}

// This function runs in the context of the webpage
function getImageUrls() {
  // Try multiple selectors to capture different page layouts
  
  // First attempt: general image selector for reader containers
  let imageElements = document.querySelectorAll('.flex.flex-col img[src*="/comic/"], .reader-container img');
  
  if (imageElements.length === 0) {
    // Second attempt: look for any large images that might be manga pages
    imageElements = document.querySelectorAll('img[width="800"], img[width="1000"], img[width="1200"]');
  }
  
  if (imageElements.length === 0) {
    // Third attempt: broader selector for any potential manga images
    imageElements = document.querySelectorAll('.chapter-container img, .reader img, .chapter-images img');
  }
  
  if (imageElements.length === 0) {
    // Last resort: get all images of reasonable size
    const allImages = document.querySelectorAll('img');
    imageElements = Array.from(allImages).filter(img => {
      // Filter by natural dimensions if available
      if (img.naturalWidth > 500 && img.naturalHeight > 500) {
        return true;
      }
      // Or by displayed dimensions
      return (img.width > 500 && img.height > 500);
    });
  }
  
  // Extract image URLs and filter out small icons
  return Array.from(imageElements)
    .map(img => img.src)
    .filter(url => url && url.length > 0 && !url.includes('icon') && !url.includes('avatar') && !url.includes('logo'));
}

// Get manga title and chapter number
function getMangaInfo() {
  const titleElement = document.querySelector('h1');
  const chapterElement = document.querySelector('.flex.items-center.justify-between h2');
  
  let mangaTitle = 'Manga';
  let chapterNumber = '0';
  
  if (titleElement) {
    mangaTitle = titleElement.textContent.trim();
  }
  
  if (chapterElement) {
    const match = chapterElement.textContent.match(/Chapter (\d+)/i);
    if (match && match[1]) {
      chapterNumber = match[1];
    }
  }
  
  return { mangaTitle, chapterNumber };
}

// Extract manga info from URL
function extractMangaInfoFromUrl(url) {
  let mangaTitle = '';
  let chapterNumber = '';
  
  // Example URLs:
  // https://comick.io/comic/isekai-koushoku-musou-roku/TSXk8cIm-chapter-1-en
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(part => part);
    
    if (pathParts.length >= 2) {
      // Get manga title from URL
      if (pathParts[0] === 'comic' && pathParts[1]) {
        mangaTitle = pathParts[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
      
      // Get chapter number from URL - handle the specific pattern
      if (pathParts.length >= 3) {
        const chapterPart = pathParts[2];
        
        // Pattern: TSXk8cIm-chapter-1-en
        const chapterMatch = chapterPart.match(/(?:chapter|ch)[^\d]*(\d+(?:\.\d+)?)/i);
        if (chapterMatch && chapterMatch[1]) {
          chapterNumber = chapterMatch[1];
        } else {
          // Fallback: try to find any number in the string
          const numberMatch = chapterPart.match(/(\d+(?:\.\d+)?)/);
          if (numberMatch && numberMatch[1]) {
            chapterNumber = numberMatch[1];
          }
        }
      }
    }
    
    console.log("Extracted from URL:", { mangaTitle, chapterNumber });
  } catch (e) {
    console.error('Error parsing URL:', e);
  }
  
  return { mangaTitle, chapterNumber };
}

// Get manga info from main page
function getMangaInfoFromMainPage() {
  const titleElement = document.querySelector('h1');
  let title = 'Unknown Manga';
  
  if (titleElement) {
    title = titleElement.textContent.trim();
  }
  
  // Try to find the latest chapter number
  const chapterElements = document.querySelectorAll('.episode-item');
  let maxChapter = 0;
  
  chapterElements.forEach(element => {
    const chapterText = element.textContent;
    const match = chapterText.match(/Chapter (\d+(\.\d+)?)/i);
    if (match && match[1]) {
      const chapterNum = parseFloat(match[1]);
      if (chapterNum > maxChapter) {
        maxChapter = chapterNum;
      }
    }
  });
  
  return { title, maxChapter };
}

// Get chapter URLs from main page
function getChapterUrls() {
  const chapterLinks = document.querySelectorAll('a[href*="/comic/"][href*="chapter"]');
  const chapters = [];
  
  chapterLinks.forEach(link => {
    const href = link.getAttribute('href');
    const chapterText = link.textContent;
    
    // Extract chapter number
    let chapterNumber = null;
    const match = chapterText.match(/Chapter (\d+(\.\d+)?)/i);
    if (match && match[1]) {
      chapterNumber = parseFloat(match[1]);
    } else {
      // Try to extract from URL
      const urlMatch = href.match(/chapter[^\d]*(\d+(\.\d+)?)/i);
      if (urlMatch && urlMatch[1]) {
        chapterNumber = parseFloat(urlMatch[1]);
      }
    }
    
    if (chapterNumber !== null) {
      // Create full URL
      const fullUrl = new URL(href, window.location.origin).href;
      
      // Add to chapters array if not already there
      if (!chapters.some(ch => ch.number === chapterNumber)) {
        chapters.push({
          number: chapterNumber,
          url: fullUrl
        });
      }
    }
  });
  
  // Sort by chapter number
  return chapters.sort((a, b) => a.number - b.number);
}

// Helper function to sanitize filenames
function sanitizeFilename(input) {
  if (!input) return "unknown";
  
  // Replace invalid filename characters with underscores
  return input
    .replace(/[\\/:*?"<>|]/g, '_') // Replace Windows invalid filename chars
    .replace(/\s+/g, ' ')          // Replace multiple spaces with single space
    .trim();                       // Remove leading/trailing spaces
}











