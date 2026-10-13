// st-status-bar 渲染验证页生成器（开发工具）— 生成模拟酒馆深色主题的测试页
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8').replace(/^import[^\n]*\n/m, '');

let injectedCss = '';
const extensionSettings = {};
const sandbox = {
    console,
    window: {},
    document: {
        head: { appendChild: () => {} },
        getElementById: () => null,
        createElement: () => {
            const o = {};
            Object.defineProperty(o, 'textContent', { set(v) { injectedCss = v; }, get() { return injectedCss; }, configurable: true });
            return o;
        },
    },
    $: () => ({ append() { return this; }, empty() { return this; }, on() { return this; }, toggleClass() { return this; }, prop() { return this; }, val() { return this; }, length: 0 }),
    structuredClone: (o) => JSON.parse(JSON.stringify(o)),
    Popup: { show: { input: async () => null, confirm: async () => true } },
    SillyTavern: {
        getContext: () => ({
            extensionSettings,
            saveSettingsDebounced: () => {},
            renderExtensionTemplateAsync: async () => '',
            eventSource: { on: () => {} },
            event_types: {},
        }),
    },
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
vm.runInContext('applyTheme();', sandbox);

const html = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8">
<title>st-status-bar 渲染验证（模拟酒馆深色主题）</title>
<style>
/* 模拟酒馆深色主题变量（ST 主题切换时自动变化） */
:root {
    --SmartThemeBlurTintColor: #1c1c21;
    --SmartThemeBodyColor: #d8d8de;
    --SmartThemeBorderColor: #44444e;
    --SmartThemeQuoteColor: #5ba3e6;
}
body { background: #141519; margin: 0; padding: 24px; font-family: "Microsoft YaHei", sans-serif; }
.chat-mock { max-width: 640px; margin: 0 auto; }
.chat-title { color: #fff; font-size: 14px; opacity: .7; margin-bottom: 12px; }
/* ===== 插件注入的真实 CSS（applyTheme 输出）===== */
${injectedCss}
/* ===== 模拟预设「平行世界」自己的 details 样式（必须不被插件污染）===== */
#chat .mes .mes_text details.preset-own { border: 1px solid #7c5cff; background: rgba(124,92,255,.08); border-radius: 8px; padding: 6px; margin: 8px 0; }
#chat .mes .mes_text details.preset-own summary { color: #b39dff; cursor: pointer; font-weight: 600; }
#chat .mes .mes_text details.preset-own .pw-box { color: var(--SmartThemeBodyColor); opacity: .75; font-size: .82em; padding: 4px 6px; }
</style></head>
<body>
<div class="chat-mock">
<div class="chat-title">▼ 模拟酒馆深色主题 · 消息渲染区（#chat .mes .mes_text）</div>
<div id="chat">
<div class="mes"><div class="mes_text">
<p style="color:var(--SmartThemeBodyColor);">沈若兰倚着水榭栏杆，指尖轻轻敲着木栏，晚风拂过她的发梢。</p>

<details class="st-sb-card" open>
<summary>沈若兰 · 19</summary>
<div class="details-content">地点: 水榭廊下<br>情绪: 心动<br>穿着: 月白褙子<br>身体: 微热<br>想法: 想多留他片刻</div>
</details>

<details class="st-sb-card">
<summary>云清 · 21</summary>
<div class="details-content">地点: 水榭廊下<br>情绪: 未明确<br>穿着: 青衫<br>身体: 未明确<br>想法: 未明确</div>
</details>

<p style="color:var(--SmartThemeBodyColor);">他递来一盏茶，目光相接时她忙别过脸。</p>

<details class="preset-own">
<summary>🌌 平行世界 · 预设自己的折叠栏</summary>
<div class="pw-box">这是预设自带的折叠状态栏，应该保持它自己的紫色样式，不被插件粉色污染。</div>
</details>

</div></div>
</div>
</div>
</body></html>`;

const out = '/mnt/d/data/Hermes_MOMO_Workbench/st-status-bar-渲染验证.html';
fs.writeFileSync(out, html, 'utf8');
console.log('✅ 测试页已生成:', out);
console.log('CSS 说明:', injectedCss.includes('color-mix') ? '含 color-mix 背景跟随酒馆主题' : '无 color-mix', '|', injectedCss.includes('st-sb-card') ? '选择器已限定' : '未限定!');