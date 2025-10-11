(function() {
    'use strict';

    function getModInfo() {
        const url = window.location.href;
        const match = url.match(/nexusmods\.com\/([^\/]+)\/mods\/(\d+)/);
        if (match) {
            return {
                game: match[1],
                modId: match[2]
            };
        }
        return null;
    }

    function getGameId() {
        console.log('Searching for game_id...');
        
        const requirementsLink = document.querySelector('a[href*="ModRequirementsPopUp"]');
        if (requirementsLink) {
            const href = requirementsLink.getAttribute('href');
            console.log('Found requirements link:', href);
            const gameIdMatch = href.match(/game_id=(\d+)/);
            if (gameIdMatch) {
                console.log('Extracted game_id from requirements link:', gameIdMatch[1]);
                return gameIdMatch[1];
            }
        }
        
        const gameElements = document.querySelectorAll('[data-game-id]');
        for (const element of gameElements) {
            const gameId = element.getAttribute('data-game-id');
            if (gameId) {
                console.log('Found game_id in data attribute:', gameId);
                return gameId;
            }
        }
        
        const allLinks = document.querySelectorAll('a[href*="game_id="], form[action*="game_id="]');
        for (const link of allLinks) {
            const url = link.getAttribute('href') || link.getAttribute('action');
            const gameIdMatch = url.match(/game_id=(\d+)/);
            if (gameIdMatch) {
                console.log('Found game_id in link/form:', gameIdMatch[1]);
                return gameIdMatch[1];
            }
        }
        
        console.error('Could not find game_id anywhere on the page!');
        return null;
    }

    function isManualDownload(downloadButton) {
        const trackingData = downloadButton.getAttribute('data-tracking');
        if (trackingData && trackingData.toLowerCase().includes('manual')) {
            return true;
        }
        
        const buttonText = downloadButton.textContent.trim().toLowerCase();
        if (buttonText.includes('manual')) {
            return true;
        }
        
        let parent = downloadButton.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
            const parentText = parent.textContent.toLowerCase();
            if (parentText.includes('manual download') || parentText.includes('manual')) {
                return true;
            }
            parent = parent.parentElement;
        }
        
        return false;
    }

    function hasRequirements(downloadButton) {
        return downloadButton.classList.contains('popup-btn-ajax') || 
               downloadButton.getAttribute('href').includes('ModRequirementsPopUp');
    }

    async function fetchFileInfoFromRequirementsPopup(fileId, gameId) {
        try {
            console.log('Fetching file info from ModRequirementsPopUp for file_id:', fileId, 'game_id:', gameId);
            
            const url = `https://www.nexusmods.com/Core/Libs/Common/Widgets/ModRequirementsPopUp?id=${fileId}&game_id=${gameId}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': '*/*',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': window.location.href
                },
                credentials: 'include'
            });

            console.log('ModRequirementsPopUp response status:', response.status);

            if (response.ok) {
                const html = await response.text();
                console.log('ModRequirementsPopUp response received');
                
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                const requirements = [];
                const requirementRows = doc.querySelectorAll('tr');
                
                requirementRows.forEach(row => {
                    const nameCell = row.querySelector('td.table-require-name, .file-name');
                    const notesCell = row.querySelector('td.table-require-notes, .notes');
                    
                    if (nameCell) {
                        const fileName = nameCell.textContent.trim();
                        const notes = notesCell ? notesCell.textContent.trim().toLowerCase() : '';
                        
                        if (!notes.includes('optional')) {
                            requirements.push({
                                name: fileName,
                                notes: notes
                            });
                        }
                    }
                });
                
                return {
                    fileId: fileId,
                    requirements: requirements,
                    hasRequiredFiles: requirements.length > 0
                };
            } else {
                throw new Error(`ModRequirementsPopUp HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error fetching from ModRequirementsPopUp:', error);
            throw error;
        }
    }

    window.nexusPersistentNotifications = window.nexusPersistentNotifications || new Map();

    // Helper function to create notification content safely
    function createNotificationContent(fileName, requirements = []) {
        const iconDiv = document.createElement('div');
        iconDiv.className = 'notification-icon';
        iconDiv.textContent = '⚠️';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'notification-content';

        const strongElement = document.createElement('strong');
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'notification-details';
        const smallElement = document.createElement('small');

        if (requirements.length > 0) {
            strongElement.textContent = 'Additional Requirements Detected';
            const reqNames = requirements.map(r => r.name).join(', ');
            detailsDiv.textContent = `${fileName} may require: ${reqNames}`;
            smallElement.textContent = 'Check mod description for full requirements before downloading';
        } else {
            strongElement.textContent = 'Warning: Possible Dependencies';
            detailsDiv.textContent = `${fileName} may have additional requirements`;
            smallElement.textContent = 'Check the mod description for dependencies before downloading';
        }

        contentDiv.appendChild(strongElement);
        contentDiv.appendChild(detailsDiv);
        contentDiv.appendChild(smallElement);

        const dismissDiv = document.createElement('div');
        dismissDiv.className = 'notification-dismiss';
        dismissDiv.title = 'Dismiss this notification';
        dismissDiv.textContent = '×';

        return { iconDiv, contentDiv, dismissDiv };
    }

    function showRequirementsNotification(container, fileName, requirements = []) {
        const notificationId = `${fileName}-${Date.now()}`;
        
        const notificationData = {
            fileName: fileName,
            requirements: requirements,
            dismissed: false,
            id: notificationId
        };
        
        window.nexusPersistentNotifications.set(notificationId, notificationData);
        
        const existingNotifications = container.querySelectorAll('.nexus-requirements-notification');
        existingNotifications.forEach(notification => {
            const notificationFileName = notification.getAttribute('data-filename');
            if (notificationFileName === fileName) {
                notification.remove();
            }
        });

        const notification = document.createElement('div');
        notification.className = 'nexus-requirements-notification persistent-notification';
        notification.setAttribute('data-filename', fileName);
        notification.setAttribute('data-notification-id', notificationId);
        
        const { iconDiv, contentDiv, dismissDiv } = createNotificationContent(fileName, requirements);
        
        notification.appendChild(iconDiv);
        notification.appendChild(contentDiv);
        notification.appendChild(dismissDiv);

        dismissDiv.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (window.nexusPersistentNotifications.has(notificationId)) {
                window.nexusPersistentNotifications.get(notificationId).dismissed = true;
            }
            
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-10px)';
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        });

        container.appendChild(notification);
    }

    function restorePersistentNotifications(container) {
        if (!window.nexusPersistentNotifications) return;
        
        window.nexusPersistentNotifications.forEach((notificationData, notificationId) => {
            if (notificationData.dismissed) return;
            if (container.querySelector(`[data-notification-id="${notificationId}"]`)) return;
            
            const notification = document.createElement('div');
            notification.className = 'nexus-requirements-notification persistent-notification';
            notification.setAttribute('data-filename', notificationData.fileName);
            notification.setAttribute('data-notification-id', notificationId);
            
            const { iconDiv, contentDiv, dismissDiv } = createNotificationContent(
                notificationData.fileName, 
                notificationData.requirements
            );
            
            notification.appendChild(iconDiv);
            notification.appendChild(contentDiv);
            notification.appendChild(dismissDiv);

            dismissDiv.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (window.nexusPersistentNotifications.has(notificationId)) {
                    window.nexusPersistentNotifications.get(notificationId).dismissed = true;
                }
                
                notification.style.opacity = '0';
                notification.style.transform = 'translateY(-10px)';
                
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            });

            container.appendChild(notification);
        });
    }

    async function resolveRequirementsFileId(requirementsUrl, container, fileName) {
        try {
            console.log('Resolving file_id from requirements URL:', requirementsUrl);
            
            const modIdMatch = requirementsUrl.match(/id=(\d+)/);
            if (!modIdMatch) {
                throw new Error('Could not extract mod ID from requirements URL');
            }
            
            const fileId = modIdMatch[1];
            console.log('Extracted file_id from requirements URL:', fileId);
            
            const gameId = getGameId();
            if (!gameId) {
                console.log('Could not find game_id, proceeding with just file_id');
                showRequirementsNotification(container, fileName);
                return {
                    fileId: fileId,
                    requirements: []
                };
            }
            
            try {
                const requirementsInfo = await fetchFileInfoFromRequirementsPopup(fileId, gameId);
                console.log('Successfully fetched requirements info:', requirementsInfo);
                
                showRequirementsNotification(container, fileName, requirementsInfo.requirements);
                
                return requirementsInfo;
            } catch (popupError) {
                console.log('ModRequirementsPopUp request failed, using basic file_id:', popupError.message);
                showRequirementsNotification(container, fileName);
                return {
                    fileId: fileId,
                    requirements: []
                };
            }
            
        } catch (error) {
            console.error('Error resolving requirements:', error);
            throw error;
        }
    }

    async function generateDownloadUrl(fileId, refererUrl) {
        try {
            const gameId = getGameId();
            if (!gameId) {
                throw new Error('Could not find game_id on this page. Check console for debugging info.');
            }
            
            const url = 'https://www.nexusmods.com/Core/Libs/Common/Managers/Downloads?GenerateDownloadUrl';
            
            console.log('Making request to:', url);
            console.log('File ID:', fileId);
            console.log('Game ID:', gameId);
            console.log('Referer:', refererUrl);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': '*/*',
                    'Referer': refererUrl || window.location.href
                },
                body: `fid=${fileId}&game_id=${gameId}`,
                credentials: 'include'
            });

            console.log('Response status:', response.status);

            if (response.ok) {
                const result = await response.json();
                console.log('Response data:', result);
                return result.url || result.downloadUrl || result;
            } else {
                const errorText = await response.text();
                console.error('Error response:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error generating download URL:', error);
            throw error;
        }
    }

    async function extractFilesFromCurrentPage() {
        const files = [];
        const seenFileIds = new Set();
        let fileCounter = 1;
        
        console.log('Extracting files from current page (files tab)...');
        
        const allDownloadButtons = document.querySelectorAll('a.btn[href*="file_id="], a.btn[href*="ModRequirementsPopUp"]');
        
        const downloadButtons = Array.from(allDownloadButtons).filter(button => isManualDownload(button));
        
        console.log('Found total download buttons:', allDownloadButtons.length);
        console.log('Found manual download buttons:', downloadButtons.length);
        
        downloadButtons.forEach((button, index) => {
            const href = button.getAttribute('href');
            console.log(`Manual button ${index + 1}:`, href);
            
            let fileId = null;
            if (hasRequirements(button)) {
                const modIdMatch = href.match(/id=(\d+)/);
                if (modIdMatch) {
                    fileId = modIdMatch[1];
                }
            } else {
                const fileIdMatch = href.match(/file_id=(\d+)/);
                if (fileIdMatch) {
                    fileId = fileIdMatch[1];
                }
            }
            
            if (fileId && seenFileIds.has(fileId)) {
                console.log(`Skipping duplicate file ID: ${fileId}`);
                return;
            }
            
            if (fileId) {
                seenFileIds.add(fileId);
            }
            
            let fileName = null;
            
            const nameElement = button.closest('.file-info')?.querySelector('.file-name') ||
                              button.closest('li')?.querySelector('.file-name') ||
                              button.closest('tr')?.querySelector('td:first-child') ||
                              button.closest('.file-expander')?.querySelector('h3') ||
                              button.previousElementSibling;
            
            if (nameElement) {
                const extractedName = nameElement.textContent.trim();
                if (extractedName && extractedName !== '') {
                    fileName = extractedName;
                }
            }
            
            if (!fileName) {
                fileName = `File ${fileCounter}`;
                fileCounter++;
            }
            
            if (hasRequirements(button)) {
                console.log('Manual file has requirements popup:', fileName);
                files.push({
                    name: fileName,
                    hasRequirements: true,
                    requirementsUrl: href.startsWith('/') ? `${window.location.origin}${href}` : href,
                    buttonElement: button,
                    fileId: fileId
                });
            } else {
                console.log('Manual direct download file:', fileName, 'ID:', fileId);
                files.push({
                    id: fileId,
                    name: fileName,
                    downloadUrl: href.startsWith('/') ? `${window.location.origin}${href}` : href,
                    hasRequirements: false,
                    fileId: fileId
                });
            }
        });
        
        console.log('Extracted manual download files from current page:', files);
        return files;
    }

    function extractSingleFileFromPage(game, modId) {
        const filesTabLink = document.querySelector('li#mod-page-tab-files a[data-target*="ModFilesTab"]');
        
        if (!filesTabLink) {
            console.log('No files tab link found');
            return [];
        }
        
        const dataTarget = filesTabLink.getAttribute('data-target');
        const gameIdMatch = dataTarget.match(/game_id=(\d+)/);
        
        if (!gameIdMatch) {
            console.log('No game ID found in data-target');
            return [];
        }
        
        return [{
            id: null,
            name: 'File 1',
            needsResolution: true,
            gameId: gameIdMatch[1],
            filesUrl: `https://www.nexusmods.com/${game}/mods/${modId}?tab=files`
        }];
    }

    async function resolveSingleFileId(filesUrl, container) {
        try {
            const response = await fetch(filesUrl);
            const html = await response.text();
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const allButtons = doc.querySelectorAll('a.btn[href*="file_id="], a.btn[href*="ModRequirementsPopUp"]');
            const manualButtons = Array.from(allButtons).filter(button => {
                const trackingData = button.getAttribute('data-tracking');
                return trackingData && trackingData.toLowerCase().includes('manual');
            });
            
            if (manualButtons.length === 0) {
                console.log('No manual download buttons found in resolved page');
                return null;
            }
            
            const firstManualButton = manualButtons[0];
            const href = firstManualButton.getAttribute('href');
            
            const fileIdMatch = href.match(/file_id=(\d+)/);
            if (fileIdMatch) {
                return {
                    fileId: fileIdMatch[1],
                    needsNotification: false
                };
            }
            
            console.log('No direct file_id found, trying ModRequirementsPopUp fallback...');
            const modIdMatch = href.match(/id=(\d+)/);
            
            if (modIdMatch) {
                const fileId = modIdMatch[1];
                console.log('Extracted file_id from ModRequirementsPopUp:', fileId);
                
                const gameId = getGameId();
                if (gameId) {
                    try {
                        console.log('Making ModRequirementsPopUp request to verify file_id...');
                        const requirementsInfo = await fetchFileInfoFromRequirementsPopup(fileId, gameId);
                        console.log('ModRequirementsPopUp request successful, file_id verified');
                        
                        showRequirementsNotification(container, 'File 1', requirementsInfo.requirements);
                        
                        return {
                            fileId: fileId,
                            needsNotification: false
                        };
                    } catch (popupError) {
                        console.log('ModRequirementsPopUp request failed, but proceeding with extracted file_id:', popupError.message);
                        return {
                            fileId: fileId,
                            needsNotification: true
                        };
                    }
                }
                
                return {
                    fileId: fileId,
                    needsNotification: true
                };
            }
            
            console.log('No file_id found in any manual download links on files page');
            return null;
        } catch (error) {
            console.error('Error resolving file ID:', error);
            return null;
        }
    }

    async function getModFiles(game, modId) {
        try {
            console.log('Getting mod files for:', game, modId);
            
            const currentUrl = window.location.href;
            const isFilesTab = currentUrl.includes('?tab=files');
            
            if (isFilesTab) {
                return extractFilesFromCurrentPage();
            }
            
            const alertSpan = document.querySelector('span.alert');
            const hasMultipleFiles = alertSpan && parseInt(alertSpan.textContent.trim()) > 1;
            
            console.log('Multiple files detected:', hasMultipleFiles);
            
            if (hasMultipleFiles) {
                return [{ 
                    isMultiple: true, 
                    count: parseInt(alertSpan.textContent.trim()),
                    filesUrl: `https://www.nexusmods.com/${game}/mods/${modId}?tab=files`
                }];
            } else {
                return extractSingleFileFromPage(game, modId);
            }
        } catch (error) {
            console.error('Error getting mod files:', error);
            return [];
        }
    }

    function showError(button, message) {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'nexus-error-message';
        
        const strongElement = document.createElement('strong');
        strongElement.textContent = 'Download Failed:';
        
        const messageText = document.createTextNode(` ${message}`);
        const lineBreak = document.createElement('br');
        
        const smallElement = document.createElement('small');
        smallElement.textContent = 'Try logging in or use the regular download method';
        
        errorMsg.appendChild(strongElement);
        errorMsg.appendChild(messageText);
        errorMsg.appendChild(lineBreak);
        errorMsg.appendChild(smallElement);
        
        button.parentNode.insertBefore(errorMsg, button.nextSibling);
        
        setTimeout(() => {
            if (errorMsg.parentNode) {
                errorMsg.parentNode.removeChild(errorMsg);
            }
        }, 5000);
    }

    function createDownloadButton(file, game, modId, container) {
        const button = document.createElement('button');
        button.className = 'nexus-quick-download-btn';
        
        if (file.isMultiple) {
            button.textContent = `Multiple Files (${file.count}) - View Files`;
            button.title = `This mod has ${file.count} files. Click to go to files page.`;
            
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = file.filesUrl;
            });
            
            return button;
        }
        
        if (file.hasRequirements) {
            button.textContent = `Quick Download: ${file.name}`;
            button.title = `Download ${file.name} (may have requirements)`;
            button.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
            
            button.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                button.disabled = true;
                button.textContent = 'Generating download link...';
                
                try {
                    const result = await resolveRequirementsFileId(file.requirementsUrl, container, file.name);
                    
                    const refererUrl = `https://www.nexusmods.com/${game}/mods/${modId}?tab=files&file_id=${result.fileId}`;
                    const downloadUrl = await generateDownloadUrl(result.fileId, refererUrl);
                    
                    if (downloadUrl) {
                        button.textContent = 'Downloading...';
                        window.open(downloadUrl, '_blank');
                        
                        setTimeout(() => {
                            button.disabled = false;
                            button.textContent = `Quick Download: ${file.name}`;
                        }, 3000);
                    } else {
                        throw new Error('No download URL received');
                    }
                } catch (error) {
                    console.error('Download failed:', error);
                    button.textContent = 'Download failed - Click to retry';
                    button.disabled = false;
                    button.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
                    showError(button, error.message);
                }
            });
            
            return button;
        }
        
        button.textContent = `Quick Download: ${file.name}`;
        button.title = `Directly download ${file.name}`;
        
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            button.disabled = true;
            button.textContent = 'Generating download link...';
            
            try {
                let fileId = file.id;
                
                if (file.needsResolution) {
                    button.textContent = 'Finding file...';
                    const result = await resolveSingleFileId(file.filesUrl, container);
                    if (!result || !result.fileId) {
                        throw new Error('Could not find file ID');
                    }
                    fileId = result.fileId;
                    
                    if (result.needsNotification) {
                        showRequirementsNotification(container, file.name);
                    }
                }
                
                button.textContent = 'Generating download link...';
                
                const refererUrl = file.downloadUrl || `https://www.nexusmods.com/${game}/mods/${modId}?tab=files&file_id=${fileId}`;
                const downloadUrl = await generateDownloadUrl(fileId, refererUrl);
                
                if (downloadUrl) {
                    button.textContent = 'Downloading...';
                    window.open(downloadUrl, '_blank');
                    
                    setTimeout(() => {
                        button.disabled = false;
                        button.textContent = `Quick Download: ${file.name}`;
                    }, 3000);
                } else {
                    throw new Error('No download URL received');
                }
                
            } catch (error) {
                console.error('Download failed:', error);
                button.textContent = 'Download failed - Click to retry';
                button.disabled = false;
                showError(button, error.message);
            }
        });
        
        return button;
    }

    async function addQuickDownloadButtons() {
        const modInfo = getModInfo();
        if (!modInfo) {
            console.log('Could not extract mod info from URL:', window.location.href);
            return;
        }

        console.log('Mod info found:', modInfo);

        const existingContainers = document.querySelectorAll('.nexus-quick-download-container');
        existingContainers.forEach(container => container.remove());

        const container = document.createElement('div');
        container.className = 'nexus-quick-download-container';
        
        const heading = document.createElement('h3');
        heading.textContent = 'Quick Downloads (Loading...)';
        container.appendChild(heading);
        
        document.body.appendChild(container);

        restorePersistentNotifications(container);

        try {
            const files = await getModFiles(modInfo.game, modInfo.modId);
            console.log('Found files:', files);
            
            // Clear container and add new heading
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
            const newHeading = document.createElement('h3');
            newHeading.textContent = 'Quick Downloads';
            container.appendChild(newHeading);
            
            restorePersistentNotifications(container);
            
            if (files.length === 0) {
                const noFilesMsg = document.createElement('p');
                noFilesMsg.style.cssText = 'color: #ecf0f1; font-size: 12px; margin: 5px 0;';
                noFilesMsg.textContent = 'No manual download files found. Make sure you\'re on a mod page with manual downloadable files.';
                container.appendChild(noFilesMsg);
                
                const debugBtn = document.createElement('button');
                debugBtn.className = 'nexus-quick-download-btn';
                debugBtn.textContent = 'Debug Info';
                debugBtn.onclick = () => {
                    console.log('Current URL:', window.location.href);
                    console.log('Mod Info:', modInfo);
                    console.log('All download links:', document.querySelectorAll('a[href*="file_id"], a[href*="ModRequirementsPopUp"]'));
                    console.log('Manual download links:', Array.from(document.querySelectorAll('a[href*="file_id"], a[href*="ModRequirementsPopUp"]')).filter(btn => {
                        const trackingData = btn.getAttribute('data-tracking');
                        return trackingData && trackingData.toLowerCase().includes('manual');
                    }));
                    console.log('Game ID search result:', getGameId());
                    console.log('Persistent notifications:', window.nexusPersistentNotifications);
                };
                container.appendChild(debugBtn);
                
                restorePersistentNotifications(container);
            } else {
                files.forEach(file => {
                    const button = createDownloadButton(file, modInfo.game, modInfo.modId, container);
                    container.appendChild(button);
                });
                
                restorePersistentNotifications(container);
            }
        } catch (error) {
            console.error('Error loading files:', error);
            
            // Clear container and show error
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
            const errorHeading = document.createElement('h3');
            errorHeading.textContent = 'Quick Downloads';
            container.appendChild(errorHeading);
            
            const errorMsg = document.createElement('p');
            errorMsg.style.cssText = 'color: #e74c3c; font-size: 12px;';
            errorMsg.textContent = 'Error loading files. Check console for details.';
            container.appendChild(errorMsg);
            
            restorePersistentNotifications(container);
        }
    }

    function init() {
        console.log('Nexus Quick Download: Initializing on', window.location.href);
        
        if (!window.location.href.match(/nexusmods\.com\/[^\/]+\/mods\/\d+/)) {
            console.log('Not a mod page, skipping');
            return;
        }

        console.log('Detected mod page, adding download buttons...');

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', addQuickDownloadButtons);
        } else {
            setTimeout(addQuickDownloadButtons, 2000);
        }
    }

    function cleanupPersistentNotifications() {
        const currentUrl = window.location.href;
        if (!currentUrl.includes('nexusmods.com') || 
            (!currentUrl.match(/nexusmods\.com\/[^\/]+\/mods\/\d+/) && window.nexusPersistentNotifications)) {
            console.log('Cleaning up persistent notifications - left mod page');
            window.nexusPersistentNotifications.clear();
        }
    }

    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            const previousUrl = lastUrl;
            lastUrl = url;
            console.log('URL changed to:', url);
            
            if (previousUrl.match(/nexusmods\.com\/[^\/]+\/mods\/\d+/) && 
                !url.match(/nexusmods\.com\/[^\/]+\/mods\/\d+/)) {
                cleanupPersistentNotifications();
            }
            
            setTimeout(init, 3000);
        }
    }).observe(document, { subtree: true, childList: true });

    window.addEventListener('beforeunload', cleanupPersistentNotifications);
    window.addEventListener('unload', cleanupPersistentNotifications);

    const observer = new MutationObserver((mutations) => {
        let shouldAddButtons = false;
        let shouldRestoreNotifications = false;
        
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                for (let node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && 
                        (node.classList?.contains('mod') || 
                         node.classList?.contains('page') ||
                         node.tagName === 'MAIN' ||
                         node.tagName === 'SECTION')) {
                        shouldAddButtons = true;
                        break;
                    }
                }
            }
            
            if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
                for (let node of mutation.removedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && 
                        (node.classList?.contains('nexus-quick-download-container') ||
                         node.querySelector?.('.nexus-quick-download-container'))) {
                        shouldAddButtons = true;
                        break;
                    }
                }
            }
        });
        
        const container = document.querySelector('.nexus-quick-download-container');
        
        if (shouldAddButtons && !container) {
            console.log('Significant DOM change detected, trying to add buttons...');
            setTimeout(addQuickDownloadButtons, 1000);
        } else if (container && window.nexusPersistentNotifications && window.nexusPersistentNotifications.size > 0) {
            const hasNotifications = container.querySelector('.nexus-requirements-notification');
            if (!hasNotifications) {
                console.log('Container exists but notifications missing, restoring...');
                setTimeout(() => restorePersistentNotifications(container), 500);
            }
        }
    });
    
    observer.observe(document.body, { 
        childList: true, 
        subtree: true 
    });

    init();

    setTimeout(init, 1000);
    setTimeout(init, 3000);
    setTimeout(init, 5000);

    if (typeof browser !== 'undefined' || typeof chrome !== 'undefined') {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        if (browserAPI && browserAPI.runtime && browserAPI.runtime.onMessage) {
            browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
                if (request.action === 'triggerQuickDownload') {
                    addQuickDownloadButtons();
                    sendResponse({ success: true });
                }
            });
        }
    }

})();