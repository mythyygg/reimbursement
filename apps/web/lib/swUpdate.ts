/**
 * Service Worker 更新管理器
 *
 * 功能：
 * 1. 检测 Service Worker 更新
 * 2. 定时检查更新
 * 3. 提供更新回调
 */

type UpdateCallback = (hasUpdate: boolean) => void;

class ServiceWorkerUpdateManager {
  private registration: ServiceWorkerRegistration | null = null;
  private updateCallback: UpdateCallback | null = null;
  private checkInterval: number | null = null;
  private isProduction = process.env.NODE_ENV === "production";

  /**
   * 初始化 Service Worker 更新管理
   * @param onUpdate - 检测到更新时的回调
   * @param checkIntervalMs - 检查更新的间隔（毫秒），默认30分钟
   */
  async init(onUpdate?: UpdateCallback, checkIntervalMs: number = 30 * 60 * 1000) {
    if (!this.isProduction) {
      console.log("[SW Update] 开发环境，跳过更新检查");
      return;
    }

    if (!("serviceWorker" in navigator)) {
      console.warn("[SW Update] 浏览器不支持 Service Worker");
      return;
    }

    this.updateCallback = onUpdate || null;

    try {
      // 注册 Service Worker
      this.registration = await navigator.serviceWorker.register("/sw.js");
      console.log("[SW Update] Service Worker 注册成功");

      // 监听更新事件
      this.setupUpdateListeners();

      // 立即检查一次更新
      await this.checkForUpdates();

      // 定时检查更新
      if (checkIntervalMs > 0) {
        this.startPeriodicCheck(checkIntervalMs);
      }

      // 监听 Service Worker 消息
      this.setupMessageListener();
    } catch (error) {
      console.error("[SW Update] 注册失败:", error);
    }
  }

  /**
   * 设置更新监听器
   */
  private setupUpdateListeners() {
    if (!this.registration) return;

    // 监听新的 Service Worker 安装
    this.registration.addEventListener("updatefound", () => {
      console.log("[SW Update] 检测到新版本");
      const newWorker = this.registration?.installing;

      if (newWorker) {
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // 有新版本可用
            console.log("[SW Update] 新版本已安装，等待激活");
            this.notifyUpdate(true);
          }
        });
      }
    });
  }

  /**
   * 设置消息监听器
   */
  private setupMessageListener() {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "SW_UPDATED") {
        console.log(`[SW Update] 更新完成，版本: ${event.data.version}`);
        this.notifyUpdate(true);
      }
    });
  }

  /**
   * 检查更新
   */
  async checkForUpdates() {
    if (!this.registration) return;

    try {
      await this.registration.update();
      console.log("[SW Update] 更新检查完成");
    } catch (error) {
      console.error("[SW Update] 检查更新失败:", error);
    }
  }

  /**
   * 开始定期检查
   */
  private startPeriodicCheck(intervalMs: number) {
    console.log(`[SW Update] 启动定期检查，间隔: ${intervalMs / 1000}秒`);

    this.checkInterval = window.setInterval(() => {
      console.log("[SW Update] 执行定期更新检查");
      this.checkForUpdates();
    }, intervalMs);

    // 页面可见时也检查一次
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        console.log("[SW Update] 页面重新可见，检查更新");
        this.checkForUpdates();
      }
    });
  }

  /**
   * 停止定期检查
   */
  stopPeriodicCheck() {
    if (this.checkInterval !== null) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log("[SW Update] 已停止定期检查");
    }
  }

  /**
   * 通知更新
   */
  private notifyUpdate(hasUpdate: boolean) {
    if (this.updateCallback) {
      this.updateCallback(hasUpdate);
    }
  }

  /**
   * 激活新版本（刷新页面）
   */
  activateUpdate() {
    console.log("[SW Update] 激活新版本");

    // 发送消息给 Service Worker，让它跳过等待
    if (this.registration?.waiting) {
      this.registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }

    // 刷新页面
    window.location.reload();
  }

  /**
   * 手动触发更新检查
   */
  async manualCheck() {
    console.log("[SW Update] 手动触发更新检查");
    await this.checkForUpdates();
  }

  /**
   * 清理资源
   */
  destroy() {
    this.stopPeriodicCheck();
    this.updateCallback = null;
    console.log("[SW Update] 资源已清理");
  }
}

// 导出单例
export const swUpdateManager = new ServiceWorkerUpdateManager();
