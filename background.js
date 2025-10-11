const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

browserAPI.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Nexus Mods Quick Download extension installed');
    } else if (details.reason === 'update') {
        console.log('Nexus Mods Quick Download extension updated');
    }
});

if (browserAPI.webRequest && browserAPI.webRequest.onBeforeSendHeaders) {
    browserAPI.webRequest.onBeforeSendHeaders.addListener(
        (details) => {
            if (details.url.includes('nexusmods.com')) {
                const headers = details.requestHeaders || [];
                
                const requiredHeaders = {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': '*/*'
                };
                
                Object.keys(requiredHeaders).forEach(headerName => {
                    const existingHeader = headers.find(h => 
                        h.name.toLowerCase() === headerName.toLowerCase()
                    );
                    
                    if (!existingHeader) {
                        headers.push({
                            name: headerName,
                            value: requiredHeaders[headerName]
                        });
                    }
                });
                
                return { requestHeaders: headers };
            }
            
            return {};
        },
        {
            urls: ['https://www.nexusmods.com/*'],
            types: ['xmlhttprequest']
        },
        ['blocking', 'requestHeaders']
    );
}

browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'downloadFile') {
        if (browserAPI.downloads && browserAPI.downloads.download) {
            browserAPI.downloads.download({
                url: request.url,
                filename: request.filename || undefined
            }).then((downloadId) => {
                sendResponse({ success: true, downloadId: downloadId });
            }).catch((error) => {
                sendResponse({ success: false, error: error.message });
            });
        } else {
            browserAPI.tabs.create({ url: request.url });
            sendResponse({ success: true });
        }
        
        return true;
    }
});

if (browserAPI.contextMenus && browserAPI.contextMenus.create) {
    try {
        browserAPI.contextMenus.create({
            id: 'nexus-quick-download',
            title: 'Quick Download Mod',
            contexts: ['page'],
            documentUrlPatterns: ['https://www.nexusmods.com/*/mods/*']
        });

        browserAPI.contextMenus.onClicked.addListener((info, tab) => {
            if (info.menuItemId === 'nexus-quick-download') {
                browserAPI.tabs.sendMessage(tab.id, { action: 'triggerQuickDownload' });
            }
        });
    } catch (error) {
        console.log('Context menus not available:', error);
    }
} else {
    console.log('Context menus API not available');
}