# Change: Refactor Export to Single HTML Report

## Why

当前导出流程需要用户点击导出记录进入详情页，然后选择 ZIP 或 CSV 格式下载，交互繁琐。用户实际需要的是一个美观的报销报告，包含费用清单和对应的票据图片/PDF，方便查看和打印。

## What Changes

- **BREAKING**: 移除 ZIP 和 CSV 导出格式，改为生成单一 HTML 报告
- 在导出记录列表上直接显示「下载导出文件」按钮，无需进入详情页
- 移除导出详情页 `/batches/[batchId]`
- HTML 报告包含：
  - 报销批次基本信息（名称、创建时间、项目名称）
  - 费用清单表格（序号、日期、金额、类别、备注、状态）
  - 每条费用对应的票据图片/PDF 内嵌显示
  - 美观的打印样式

## Impact

- Affected specs: export-capability (新建)
- Affected code:
  - `apps/web/app/projects/[projectId]/batches/page.tsx` - 添加下载按钮
  - `apps/web/app/batches/[batchId]/page.tsx` - 删除此页面
  - `apps/api/src/worker/jobs/export.ts` - 重构为生成 HTML
  - `apps/api/src/routes/exports.ts` - 简化导出类型为 HTML only
  - `packages/shared/src/utils/exportNaming.ts` - 可能需要调整
