# Comick.io Manga Downloader

A browser extension that allows you to download manga chapters from comick.io with a single click.

## Features

- Download entire manga chapters with one click
- Batch download multiple chapters at once
- Automatically organizes downloads into folders by manga title and chapter number
- Preserves original image formats (jpg, png, webp, etc.)
- Works with both manga and manhwa formats
- Extracts manga title and chapter number from URL for consistent organization
- Saves directly to your default downloads folder
- Continues downloading in the background even when popup is closed
- Customizable delay settings to prevent rate limiting

## Installation

### Chrome/Edge/Brave

1. Download or clone this repository
2. Open your browser and navigate to `chrome://extensions/` (or equivalent)
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the folder containing the extension files
5. The extension should now appear in your toolbar

## Usage

### Single Chapter Download

1. Navigate to any manga chapter page on comick.io
2. Click the extension icon in your browser toolbar
3. Click the "Download Chapter" button
4. The extension will automatically download all images from the chapter
5. Files will be saved to `[Your Downloads Folder]/Manga/[Manga Title]/Chapter [Number]/`

### Batch Download

1. Navigate to any manga main page on comick.io (the page that lists all chapters)
2. Click the extension icon in your browser toolbar
3. Enter the range of chapters you want to download (e.g., from chapter 1 to 10)
4. Click the "Download Selected Chapters" button
5. The extension will download all chapters in the specified range
6. You can close the popup and the download will continue in the background

### Advanced Settings

The extension provides customizable delay settings to prevent rate limiting:

1. Click "Show Advanced Settings" in the popup
2. Adjust the following settings:
   - Page Load Delay: How long to wait after opening a chapter page (in seconds)
   - Image Download Delay: How long to wait between downloading images (in seconds)
   - Chapter Delay: How long to wait between chapters (in seconds)
3. Click "Save Settings" to apply your changes

## How It Works

The extension:
1. Extracts manga title and chapter number from the URL
2. Identifies all manga images on the page using various selectors
3. Downloads each image with a sequential filename (001.jpg, 002.jpg, etc.)
4. Organizes files into folders based on manga title and chapter number
5. For batch downloads, processes each chapter sequentially with configurable delays

## Permissions

This extension requires the following permissions:
- `activeTab`: To access the current tab's content
- `downloads`: To download images
- `scripting`: To run scripts on the active tab
- `tabs`: To open and manage tabs for batch downloading
- `storage`: To save user settings

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests.

## License

[MIT License](LICENSE)
