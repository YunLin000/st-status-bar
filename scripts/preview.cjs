// st-status-bar v2 渲染验证页生成器 — 在真实浏览器里跑真实 index.js，验证 JSON 捕获→DOM 构建→样式
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const body = src.replace(/^import[^\n]*\n/m, '');   // 去 ESM import，便于内联到 <script>

// 用 node:vm 跑 applyTheme() 拿真实 CSS
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
    SillyTavern: { getContext: () => ({ extensionSettings, saveSettingsDebounced: () => {}, renderExtensionTemplateAsync: async () => '', eventSource: { on: () => {} }, event_types: {} }) },
};
vm.createContext(sandbox);
vm.runInContext(body, sandbox);
vm.runInContext('applyTheme();', sandbox);

// 模拟 LLM 输出的 statusbar 代码块（1 个正常 + 1 个脏 JSON 测容错）
const goodJSON = JSON.stringify({
    characters: [
        { name: '白婉媚', age: '28', stats: [{ label: '地点', value: '水榭廊下' }, { label: '情绪', value: '心动' }, { label: '穿着', value: '月白褙子' }, { label: '身体', value: '微热' }, { label: '想法', value: '想多留他片刻' }] },
        { name: '白小瑶', age: '18', stats: [{ label: '地点', value: '水榭廊下' }, { label: '情绪', value: '羞怯' }, { label: '穿着', value: '藕荷短襦' }, { label: '身体', value: '健康' }, { label: '想法', value: '姐姐又在看他' }] },
    ],
    user: { name: '云清', age: '30', stats: [{ label: '地点', value: '水榭廊下' }, { label: '情绪', value: '未明确' }, { label: '穿着', value: '青衫' }, { label: '身体', value: '未明确' }, { label: '想法', value: '未明确' }] },
});
const dirtyJSON = `{"characters":[{"name":"白小汐","age":"18","stats":[{"label":"地点","value":"亭中"},{"label":"情绪","value":"好奇"},],}],"user":{"name":"云清","age":"30","stats":[{"label":"地点","value":"亭外"}]}}`; // 含尾逗号 + 单行

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const html = `<!DOCTYPE html>
<html lang="zh"><head><meta charset="utf-8">
<title>st-status-bar v2 渲染验证（模拟酒馆深色主题）</title>
<style>
:root { --SmartThemeBlurTintColor: #1c1c21; --SmartThemeBodyColor: #d8d8de; --SmartThemeBorderColor: #44444e; --SmartThemeQuoteColor: #5ba3e6; }
body { background: #141519; margin: 0; padding: 24px; font-family: "Microsoft YaHei", sans-serif; }
.chat-mock { max-width: 640px; margin: 0 auto; }
.t { color: #fff; font-size: 13px; opacity: .6; margin: 14px 0 6px; }
/* ===== 插件真实 CSS ===== */
${injectedCss}
</style></head>
<body>
<div class="chat-mock">
<div class="t">▼ 模拟酒馆深色主题 · 新架构（LLM 输出 JSON 代码块 → 插件渲染）</div>
<div id="chat"><div class="mes"><div class="mes_text" id="target">
<p style="color:var(--SmartThemeBodyColor);">白婉媚倚着栏杆，晚风拂过她的发梢。</p>
<pre><code class="language-statusbar">${esc(goodJSON)}</code></pre>
</div></div></div>

<div class="t">▼ 容错测试：LLM 输出带尾逗号的脏 JSON，应仍能解析渲染</div>
<div id="chat"><div class="mes"><div class="mes_text" id="target2">
<pre><code class="language-statusbar">${esc(dirtyJSON)}</code></pre>
</div></div></div>
</div>

<!-- mock 酒馆环境（内联 index.js 需要） -->
<script>
window.SillyTavern = { getContext: () => ({ extensionSettings: {}, saveSettingsDebounced: () => {}, renderExtensionTemplateAsync: async () => '', eventSource: { on: () => {} }, event_types: {} }) };
window.$ = function () { const noop = function () { return this; }; return { append: noop, empty: noop, on: noop, off: noop, toggleClass: noop, prop: noop, val: noop, text: noop, closest: function () { return this; }, length: 0, attr: function () { return ''; } }; };
window.Popup = { show: { input: async () => null, confirm: async () => true } };
</script>

<!-- 真实插件代码（去掉 import） -->
<script>
${body}
</script>

<!-- 触发渲染 -->
<script>
try {
  renderStatusBarIn(document.getElementById('target'), getSettings());
  renderStatusBarIn(document.getElementById('target2'), getSettings());
  window.__done = true;
} catch (e) {
  window.__err = String(e && e.stack || e);
  document.title = 'ERR: ' + String(e);
}
</script>
</body></html>`;

const out = '/mnt/d/data/Hermes_MOMO_Workbench/st-status-bar-渲染验证v2.html';
fs.writeFileSync(out, html, 'utf8');
console.log('✅ v2 测试页已生成:', out);
console.log('CSS 含 st-sb-card:', injectedCss.includes('st-sb-card'), '| 含 st-sb-line:', injectedCss.includes('st-sb-line'));