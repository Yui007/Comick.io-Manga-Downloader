// Global state to track ongoing downloads
let downloadState = {
  isDownloading: false,
  currentChapter: null,
  totalChapters: 0,
  progress: 0
};

// Default delay settings
const DEFAULT_SETTINGS = {
  pageLoadDelay: 10,    // seconds
  imageDelay: 2,        // seconds
  chapterDelay: 10      // seconds
};

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startBatchDownload") {
    // Start the batch download process
    startBatchDownload(message.data);
    sendResponse({ success: true });
    return true; // Keep the message channel open for async response
  } 
  else if (message.action === "getDownloadStatus") {
    // Return the current download status
    sendResponse(downloadState);
    return true;
  }
});

// Function to start batch download
async function startBatchDownload(data) {
  const { mangaInfo, selectedChapters, settings = DEFAULT_SETTINGS } = data;
  
  downloadState = {
    isDownloading: true,
    currentChapter: 0,
    totalChapters: selectedChapters.length,
    progress: 0
  };
  
  // Download chapters one by one
  for (let i = 0; i < selectedChapters.length; i++) {
    const chapter = selectedChapters[i];
    
    downloadState.currentChapter = i + 1;
    downloadState.progress = Math.round((i / selectedChapters.length) * 100);
    
    // Open chapter page in a new tab
    const chapterTab = await chrome.tabs.create({ 
      url: chapter.url,
      active: false
    });
    
    // Wait for page to load using the configured delay
    await new Promise(resolve => setTimeout(resolve, settings.pageLoadDelay * 1000));
    
    // Get images from the chapter page
    const imageResults = await chrome.scripting.executeScript({
      target: { tabId: chapterTab.id },
      function: getImageUrls
    });
    
    const imageUrls = imageResults[0].result;
    
    if (imageUrls && imageUrls.length > 0) {
      // Download images
      await downloadChapterImages(imageUrls, mangaInfo.title, chapter.number, settings);
    }
    
    // Close the tab
    await chrome.tabs.remove(chapterTab.id);
    
    // Wait between chapters using the configured delay
    await new Promise(resolve => setTimeout(resolve, settings.chapterDelay * 1000));
  }
  
  downloadState = {
    isDownloading: false,
    currentChapter: selectedChapters.length,
    totalChapters: selectedChapters.length,
    progress: 100
  };
}

// Function to download chapter images
async function downloadChapterImages(imageUrls, mangaTitle, chapterNumber, settings) {
  // Sanitize manga title and chapter number for valid filenames
  const sanitizedTitle = sanitizeFilename(mangaTitle);
  const sanitizedChapter = sanitizeFilename(chapterNumber.toString());
  
  // Create folder path for the manga chapter
  const folderPath = `Manga/${sanitizedTitle}/Chapter ${sanitizedChapter}/`;
  
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
      
      // Add a delay between downloads using the configured delay
      await new Promise(resolve => setTimeout(resolve, settings.imageDelay * 1000));
    } catch (error) {
      console.error(`Error downloading image ${i+1}:`, error);
      // Continue with next image instead of stopping the whole process
    }
  }
  
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

// Helper function to sanitize filenames
function sanitizeFilename(input) {
  if (!input) return "unknown";
  
  // Replace invalid filename characters with underscores
  return input
    .replace(/[\\/:*?"<>|]/g, '_') // Replace Windows invalid filename chars
    .replace(/\s+/g, ' ')          // Replace multiple spaces with single space
    .trim();                       // Remove leading/trailing spaces
}
