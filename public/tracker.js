(function (window, document) {
  // CONFIGURATION: Change this to your deployed Netlify URL later
  const ENDPOINT = 'https://YOUR-APP-NAME.netlify.app/api/track'; 
  const SITE_ID = document.currentScript.getAttribute('data-site-id');

  let eventQueue = [];

  // Helper: Get CSS Selector
  const getPath = (el) => {
    if (!(el instanceof Element)) return;
    const path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (el.id) {
        selector += '#' + el.id;
        path.unshift(selector);
        break;
      }
      path.unshift(selector);
      el = el.parentNode;
    }
    return path.join(" > ");
  };

  const flush = () => {
    if (eventQueue.length === 0) return;
    const payload = JSON.stringify({
      siteId: SITE_ID,
      url: window.location.href,
      events: eventQueue
    });

    // Use sendBeacon for reliability
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, payload);
    } else {
      fetch(ENDPOINT, { method: 'POST', body: payload, keepalive: true });
    }
    eventQueue = [];
  };

  // Track Clicks
  document.addEventListener('click', (e) => {
    eventQueue.push({
      type: 'click',
      x: e.pageX,
      y: e.pageY,
      path: getPath(e.target),
      timestamp: Date.now()
    });
    // Flush immediately on click for this demo (optimize to batching in prod)
    flush();
  });

})(window, document);
