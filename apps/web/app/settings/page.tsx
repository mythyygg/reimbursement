"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";
import BottomNav from "../../components/BottomNav";
import { useToast } from "../../components/Toast";
import { useErrorHandler } from "../../lib/useErrorHandler";

export default function SettingsPage() {
  const { showSuccess } = useToast();
  const { handleError } = useErrorHandler();

  const { data, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch("/settings")
  });

  const settings = data as any;
  const [saving, setSaving] = useState(false);

  const updateSettings = async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await apiFetch("/settings", {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      await refetch();
      showSuccess("设置已保存");
    } catch (error) {
      handleError(error, "保存设置失败");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="min-h-screen bg-surface-1 p-6">
        <div className="text-sm text-text-secondary">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-1 pb-20">
      <div className="mx-auto max-w-md px-4 pt-6 space-y-4">
        <div className="rounded-2xl bg-surface-0 p-4 shadow-sm">
          <div className="text-sm font-semibold mb-3">匹配规则</div>
          <div className="space-y-3">
            <div>
              <label htmlFor="dateWindow" className="text-xs text-text-secondary mb-1 block">
                日期容差（天）
              </label>
              <input
                id="dateWindow"
                className="h-11 w-full rounded-xl border border-border px-3 text-sm"
                type="number"
                min="0"
                max="30"
                step="1"
                value={settings.matchRulesJson?.dateWindowDays ?? 3}
                onChange={(event) =>
                  updateSettings({
                    match_rules: {
                      ...settings.matchRulesJson,
                      dateWindowDays: Math.max(0, Math.min(30, Number(event.target.value)))
                    }
                  })
                }
                aria-label="日期容差（天）"
              />
              <p className="text-xs text-text-tertiary mt-1">
                票据和报销单日期在此天数内可以匹配
              </p>
            </div>
            <div>
              <label htmlFor="amountTolerance" className="text-xs text-text-secondary mb-1 block">
                金额容差（元）
              </label>
              <input
                id="amountTolerance"
                className="h-11 w-full rounded-xl border border-border px-3 text-sm"
                type="number"
                min="0"
                max="1000"
                step="0.01"
                value={settings.matchRulesJson?.amountTolerance ?? 0}
                onChange={(event) =>
                  updateSettings({
                    match_rules: {
                      ...settings.matchRulesJson,
                      amountTolerance: Math.max(0, Math.min(1000, Number(event.target.value)))
                    }
                  })
                }
                aria-label="金额容差（元）"
              />
              <p className="text-xs text-text-tertiary mt-1">
                票据和报销单金额在此范围内可以匹配
              </p>
            </div>
            <label className="flex items-center justify-between text-sm py-2 border-t border-border">
              <div>
                <div>需要类别匹配</div>
                <p className="text-xs text-text-tertiary mt-1">
                  勾选后只匹配类别相同的票据和报销单
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.matchRulesJson?.requireCategoryMatch ?? false}
                onChange={(event) =>
                  updateSettings({
                    match_rules: {
                      ...settings.matchRulesJson,
                      requireCategoryMatch: event.target.checked
                    }
                  })
                }
                className="h-5 w-5 rounded border-border text-primary focus:ring-primary ml-3"
                aria-label="需要类别匹配"
              />
            </label>
          </div>
        </div>

        <div className="rounded-2xl bg-surface-0 p-4 shadow-sm">
          <div className="text-sm font-semibold mb-2">导出模板</div>
          <div className="grid gap-2 text-sm">
            <label className="flex items-center justify-between py-2">
              <span>包含商户关键词</span>
              <input
                type="checkbox"
                checked={settings.exportTemplateJson?.includeMerchantKeyword ?? false}
                onChange={(event) =>
                  updateSettings({
                    export_template: {
                      ...settings.exportTemplateJson,
                      includeMerchantKeyword: event.target.checked
                    }
                  })
                }
                className="h-5 w-5 rounded border-border text-primary focus:ring-primary"
                aria-label="包含商户关键词"
              />
            </label>
          </div>
          {saving ? (
            <div className="text-xs text-primary mt-3" role="status" aria-live="polite">
              保存中...
            </div>
          ) : null}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
