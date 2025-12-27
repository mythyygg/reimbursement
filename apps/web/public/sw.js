// Service Worker 版本号 - 每次更新时修改此版本号
const VERSION = "v1.0.1";
const CACHE_NAME = `reimbursement-cache-${VERSION}`;
const CORE_ASSETS = ["/", "/manifest.json"];

// 安装事件：缓存核心资源
self.addEventListener("install", (event) => {
  console.log(`[SW] Installing version ${VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    }).then(() => {
      // 强制激活新的 Service Worker
      return self.skipWaiting();
    })
  );
});

// 激活事件：清理旧缓存
self.addEventListener("activate", (event) => {
  console.log(`[SW] Activating version ${VERSION}`);
  event.waitUntil(
    // 删除所有旧版本的缓存
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log(`[SW] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // 立即接管所有客户端
      return self.clients.claim();
    }).then(() => {
      // 通知所有客户端更新完成
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: "SW_UPDATED",
            version: VERSION
          });
        });
      });
    })
  );
});

// 请求拦截：网络优先策略（优先获取最新内容）
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  // API 请求不缓存
  if (event.request.url.includes("/api/")) {
    return;
  }

  event.respondWith(
    // 网络优先策略：先尝试从网络获取，失败则使用缓存
    fetch(event.request)
      .then((response) => {
        // 只缓存成功的响应
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, copy);
          });
        }
        return response;
      })
      .catch(() => {
        // 网络失败时使用缓存
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // 如果缓存也没有，返回离线页面或错误
          return new Response("离线状态，请检查网络连接", {
            status: 503,
            statusText: "Service Unavailable"
          });
        });
      })
  );
});

// 定期检查更新（每小时）
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "CHECK_UPDATE") {
    // 触发更新检查
    self.registration.update();
  }
});
