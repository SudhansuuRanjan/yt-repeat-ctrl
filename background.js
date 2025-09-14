chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    
    const rule = {
      conditions: [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { hostEquals: 'www.youtube.com' },
        })
      ],
      actions: [
        new chrome.declarativeContent.ShowAction()
      ]
    };

    chrome.declarativeContent.onPageChanged.addRules([rule]);
  });
});