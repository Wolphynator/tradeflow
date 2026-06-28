self.addEventListener('push', e => {
  const d = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(d.title || 'TradeFlow', {
      body: d.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tag || 'tradeflow',
      requireInteraction: false,
      data: { url: '/' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || '/'));
});
