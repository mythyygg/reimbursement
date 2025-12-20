import { useToast } from "../components/Toast";

/**
 * 统一的错误处理 Hook
 *
 * @description
 * 提供友好的中文错误消息映射和显示
 */
export function useErrorHandler() {
  const { showError } = useToast();

  const handleError = (error: unknown, fallbackMessage = "操作失败") => {
    if (error instanceof Error) {
      // 映射常见错误消息为友好的中文
      const errorMap: Record<string, string> = {
        "INVALID_INPUT": "输入信息有误，请检查",
        "UNAUTHORIZED": "未登录或登录已过期",
        "NOT_FOUND": "未找到相关数据",
        "PROJECT_NOT_FOUND": "项目不存在",
        "EXPENSE_NOT_FOUND": "报销单不存在",
        "RECEIPT_NOT_FOUND": "票据不存在",
        "RECEIPT_ALREADY_MATCHED": "票据已关联其他报销单",
        "Network Error": "网络连接失败，请检查网络",
        "Failed to fetch": "网络请求失败，请稍后重试"
      };

      const friendlyMessage = errorMap[error.message] || error.message || fallbackMessage;
      showError(friendlyMessage);
    } else {
      showError(fallbackMessage);
    }
  };

  return { handleError };
}
