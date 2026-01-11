"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { setTokens, getAccessToken } from "../../lib/auth";
import { useToast } from "../../components/Toast";
import { apiFetch } from "../../lib/api";
import { useErrorHandler } from "../../lib/useErrorHandler";

// 邮箱验证正则
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 手机号验证正则（中国手机号）
const PHONE_REGEX = /^1[3-9]\d{9}$/;

export default function LoginPage() {
  const router = useRouter();
  const { showError } = useToast();
  const { handleError } = useErrorHandler();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ emailOrPhone?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      router.replace("/projects");
    }
  }, [router]);

  const validateForm = () => {
    const newErrors: { emailOrPhone?: string; password?: string } = {};

    // 验证邮箱或手机号
    if (!emailOrPhone.trim()) {
      newErrors.emailOrPhone = "请输入邮箱或手机号";
    } else if (!EMAIL_REGEX.test(emailOrPhone) && !PHONE_REGEX.test(emailOrPhone)) {
      newErrors.emailOrPhone = "请输入有效的邮箱或手机号";
    }

    // 验证密码
    if (!password) {
      newErrors.password = "请输入密码";
    } else if (password.length < 8) {
      newErrors.password = "密码至少需要8位";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submit = async () => {
    // 前端验证
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    const path = mode === "login" ? "/auth/password/login" : "/auth/password/register";
    try {
      const data = await apiFetch<{ tokens: any }>(path, {
        method: "POST",
        body: JSON.stringify({ email_or_phone: emailOrPhone, password })
      });
      setTokens(data.tokens);
      router.replace("/projects");
    } catch (err) {
      handleError(err, "认证失败");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailOrPhoneChange = (value: string) => {
    setEmailOrPhone(value);
    if (errors.emailOrPhone) {
      setErrors({ ...errors, emailOrPhone: undefined });
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (errors.password) {
      setErrors({ ...errors, password: undefined });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-1 px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface-0 p-8 shadow-soft-lg animate-fade-up">
        <h1 className="text-2xl font-bold mb-2 text-text-primary">报销助手</h1>
        <p className="text-sm text-text-secondary mb-8">
          {mode === "login" ? "登录以继续" : "创建新账号"}
        </p>
        <div className="flex gap-2 mb-8 p-1 bg-surface-2 rounded-xl">
          <button
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 ease-out cursor-pointer ${
              mode === "login"
                ? "bg-surface-0 text-primary shadow-soft"
                : "bg-transparent text-text-secondary hover:text-text-primary"
            }`}
            onClick={() => setMode("login")}
          >
            登录
          </button>
          <button
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 ease-out cursor-pointer ${
              mode === "register"
                ? "bg-surface-0 text-primary shadow-soft"
                : "bg-transparent text-text-secondary hover:text-text-primary"
            }`}
            onClick={() => setMode("register")}
          >
            注册
          </button>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <input
              className={`h-12 w-full rounded-xl border px-4 text-sm transition-all duration-200 focus:outline-none focus:ring-2 ${
                errors.emailOrPhone
                  ? "border-danger bg-danger-light/50 focus:border-danger focus:ring-danger/20"
                  : "border-border bg-surface-1 focus:border-primary focus:ring-primary/20"
              }`}
              placeholder="邮箱或手机号"
              value={emailOrPhone}
              onChange={(event) => handleEmailOrPhoneChange(event.target.value)}
              onBlur={validateForm}
              aria-label="邮箱或手机号"
              aria-invalid={!!errors.emailOrPhone}
              aria-describedby={errors.emailOrPhone ? "email-error" : undefined}
            />
            {errors.emailOrPhone ? (
              <p id="email-error" className="mt-1.5 text-xs text-danger font-medium">
                {errors.emailOrPhone}
              </p>
            ) : null}
          </div>
          <div>
            <input
              className={`h-12 w-full rounded-xl border px-4 text-sm transition-all duration-200 focus:outline-none focus:ring-2 ${
                errors.password
                  ? "border-danger bg-danger-light/50 focus:border-danger focus:ring-danger/20"
                  : "border-border bg-surface-1 focus:border-primary focus:ring-primary/20"
              }`}
              placeholder="密码（至少8位）"
              type="password"
              value={password}
              onChange={(event) => handlePasswordChange(event.target.value)}
              onBlur={validateForm}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  submit();
                }
              }}
              aria-label="密码"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
            />
            {errors.password ? (
              <p id="password-error" className="mt-1.5 text-xs text-danger font-medium">
                {errors.password}
              </p>
            ) : null}
          </div>
          <button
            className="h-12 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-hover transition-all duration-200 ease-out active:scale-[0.98] shadow-soft cursor-pointer"
            onClick={submit}
            disabled={loading}
          >
            {loading ? "加载中..." : mode === "login" ? "登录" : "注册"}
          </button>
        </div>
      </div>
    </div>
  );
}
