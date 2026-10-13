// st-status-bar smoke test v2 — vm 模拟 ST 环境跑真实 index.js，验证核心逻辑
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const body = src.replace(/^import[^\n]*\n/m, '');

// ⚠️ extensionSettings 必须是稳定引用（真实 ST getContext 返回同一 context）
const extensionSettings = {};
let injectedCss = '';

function makeNode(tag) {
    const e = { tagName: tag, className: '', _text: '', children: [], appendChild(c) { this.children.push(c); return c; } };
    Object.defineProperty(e, 'textContent', { get() { return e._text; }, set(v) { e._text = v; }, configurable: true });
    return e;
}

const sandbox = {
    console,
    window: { prompt: () => null, confirm: () => true },
    document: {
        head: { appendChild: () => {} },
        getElementById: () => null,
        createElement: (tag) => {
            if (tag === 'style') {
                const o = {};
                Object.defineProperty(o, 'textContent', { set(v) { injectedCss = v; }, get() { return injectedCss; }, configurable: true });
                return o;
            }
            return makeNode(tag);
        },
        querySelectorAll: () => [],
    },
    $: () => ({ append() { return this; }, empty() { return this; }, on() { return this; }, off() { return this; }, toggleClass() { return this; }, prop() { return this; }, val() { return this; }, length: 0, closest() { return this; }, attr() { return ''; } }),
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
vm.runInContext(body, sandbox);

const run = (code) => vm.runInContext(code, sandbox);
let pass = 0, fail = 0;
function assert(name, cond) {
    if (cond) { pass++; console.log('✅', name); }
    else { fail++; console.log('❌', name); }
}

// 1. 协议：要求 LLM 输出 statusbar JSON 代码块（不再输出 HTML）
const proto = run('buildProtocol(getSettings())');
assert('含 statusbar 围栏标记', proto.includes('```statusbar'));
assert('含 JSON OutputFormat 段', proto.includes('<OutputFormat>'));
assert('含 characters 字段说明', proto.includes('characters'));
assert('含 user 字段说明', proto.includes('user'));
assert('含 stats 结构', proto.includes('"stats"'));
assert('含在场判定规则', proto.includes('在场'));
assert('含不在场排除规则', proto.includes('不在场'));
assert('含用户栏「未明确」规则', proto.includes('未明确'));
assert('含禁止把用户放进 characters', proto.includes('绝对禁止'));
assert('协议不再输出 <details> HTML', !proto.includes('<details'));
assert('协议不再用 <br> 分隔', !proto.includes('<br>'));

// 2. 自定义条目进协议
run("getSettings().character.items.push({ key: 'x', label: '笑容', rule: '笑容的展示方式' })");
const proto2 = run('buildProtocol(getSettings())');
assert('自定义条目「笑容」进入协议字段', proto2.includes('"label":"笑容"'));
assert('自定义条目规则进入协议', proto2.includes('笑容：笑容的展示方式'));

// 3. 主题 CSS
run("getSettings().theme.primary = '#a0392c'; getSettings().theme.borderStyle = 'dashed'; getSettings().theme.borderWidth = 3; getSettings().theme.borderRadius = 20; applyTheme();");
const css = injectedCss;
assert('主题注入产生 CSS', css.includes('--st-sb-rgb:160,57,44'));
assert('边框样式跟随主题', css.includes('3px dashed'));
assert('圆角跟随主题', css.includes('border-radius:20px'));
assert('summary 文字用派生亮色', /--st-sb-light:#[0-9a-f]{6}/.test(css));
assert('CSS 限定 st-sb-card（不影响预设其他 details）', /\.mes_text details\.st-sb-card\{/.test(css) && !/\.mes_text details\{/.test(css));
assert('背景跟随酒馆主题变量', css.includes('--SmartThemeBlurTintColor'));
assert('文字跟随酒馆主题变量', css.includes('--SmartThemeBodyColor'));
assert('有条目行样式 st-sb-line', css.includes('st-sb-line'));

// 4. 宽松 JSON 解析容错
const good = run(`parseLooseJSON('{"characters":[{"name":"A"}],"user":{"name":"B"}}')`);
assert('正常 JSON 解析', good && good.characters && good.characters[0].name === 'A');
const dirty = run(`parseLooseJSON('{"characters":[{"name":"C","stats":[{"label":"地点","value":"亭"},],}],"user":{"name":"D"}}')`);
assert('尾逗号 JSON 容错解析', dirty && dirty.characters && dirty.characters[0].name === 'C');
const fenced = run("parseLooseJSON('```statusbar\\n{\"a\":1}\\n```')");
assert('带围栏残留的 JSON 容错', fenced && fenced.a === 1);
const broken = run(`parseLooseJSON('这不是 JSON')`);
assert('非 JSON 返回 null', broken === null);

// 4b. 真实回归案例：用户实测 LLM 输出缺 value 键的非法 JSON
const realRaw = `{"characters":[{"name":"白婉媚","age":"200余岁(外表28)","stats":[{"label":"地点","value":"别墅一楼·咖啡机旁"},{"label":"情绪","value":"含笑纵容，暗自留意云清口味"},{"label":"穿着","value":"月白明制立领长衫，黛青马面裙，白玉流苏步摇"},{"label":"身体","value":"健康，早起张罗早饭"},{"label":"想法","value":"云清待孩子们是真心，这份恩情要还得分寸"}]},{"name":"白小汐","age":"30余岁(外表18)","stats":[{"label":"地点","value":"别墅一楼·茶台边"},{"label":"情绪","value":"表面安静，耳尖还留着薄红"},{"label":"穿着","value":"浅青短款交领襦裙，素色腰封，双环髻珠花，银镯"},{"label":"身体","value":"健康，刚被摸过发顶"},{"label":"想法","value":"掌心是暖的，罢了，先把茶张罗好"}]},{"name":"白小瑶","age":"30余岁(外表18)","stats":[{"label":"地点","value":"别墅一楼·云清肩侧"},{"label":"情绪","value":"雀跃，还想再被摸一下"},{"label":"穿着","value":"鹅黄短款襦裙，双丸子头铃铛发绳，红绳铃铛手链两条"},{"label":"身体","value":"健康，铃铛一直响"},{"label":"想法","value":"公子摸我了！要给他看我的天气！"}]}],"user":{"name":"云清","age":"未明确","stats":[{"label":"地点","value":"别墅一楼·茶台旁"},{"label":"情绪","value":"未明确"},{"label":"穿着","value":"白色丝绸暗纹交领上衣，黑色缎面龙纹马面裙"},{"label":"身体","value":"未明确"},{"label":"想法":"未明确"}]}}`;
const real = run('parseLooseJSON(' + JSON.stringify(realRaw) + ')');
assert('真实案例（缺 value 键的非法 JSON）可解析', !!real);
assert('真实案例 characters = 3', real && real.characters.length === 3);
assert('真实案例 user 存在', real && !!real.user);
assert('真实案例 user.stats = 5 项', real && real.user.stats.length === 5);
assert('缺 value 键末项修复正确', real && real.user.stats[4].label === '想法' && real.user.stats[4].value === '未明确');
assert('中文引号 JSON 容错', (() => { const r = run('parseLooseJSON(`{\u201ccharacters\u201d:[],\u201cuser\u201d:{\u201cname\u201d:\u201cA\u201d,\u201cstats\u201d:[]}}`)'); return r && r.user && r.user.name === 'A'; })());
assert('严重损坏 JSON 走降级提取', (() => { const r = run('parseLooseJSON(`{"characters":[{"name":"B","age":"1","stats":[{"label":"地点","value":"家"}]}],"user":{"name":"C","age":"2","stats":[{"label":"情绪","value":"好"}]`)'); return r && r.characters.length === 1 && r.characters[0].name === 'B' && !!r.user; })());

// 5. DOM 构建：user 第一 + 卡片结构（先重置 items 为默认，排除前面自定义条目测试的污染）
run(`getSettings().character.items = structuredClone(DEFAULTS.character.items)`);
const wrap = run(`buildStatusBarElement({characters:[{name:"白婉媚",age:"28",stats:[{label:"地点",value:"水榭"},{label:"情绪",value:"心动"}]}],user:{name:"云清",age:"30",stats:[{label:"地点",value:"未明确"}]}}, getSettings())`);
assert('wrap 容器 class', wrap.className === 'st-sb-wrap');
assert('渲染 2 张卡（user + 1 角色）', wrap.children.length === 2);
assert('用户栏固定第一', wrap.children[0].className === 'st-sb-card' && wrap.children[0].children[0].textContent === '云清 · 30');
assert('角色卡标题模板正确', wrap.children[1].children[0].textContent === '白婉媚 · 28');
assert('角色卡补全完整条目（2 项→5 行）', wrap.children[1].children[1].children.length === 5);
assert('条目行 class + 文本', wrap.children[1].children[1].children[0].className === 'st-sb-line' && wrap.children[1].children[1].children[0].textContent === '地点: 水榭');
assert('缺值填「未明确」', wrap.children[0].children[1].children[0].textContent === '地点: 未明确');
assert('年龄缺失时不留尾部分隔符', run(`applyTitle('{{name}} · {{age}}','某人','')`) === '某人');

// 5b. 保底显示：即使 JSON 完全损坏也渲染出完整状态栏
const salv = run(`salvageParse('完全乱码无任何JSON结构')`);
assert('完全损坏 JSON 兜底占位（1张卡）', salv && salv.characters && salv.characters.length === 1);
const salvWrap = run(`buildStatusBarElement(salvageParse('乱码'), getSettings())`);
assert('完全损坏也渲染出卡片容器', salvWrap && salvWrap.className === 'st-sb-wrap');
assert('标题空时占位「角色状态」', salvWrap.children[0].children[0].textContent === '角色状态');
assert('stats 空时补全完整 5 条', salvWrap.children[0].children[1].children.length === 5);
assert('补全条目值填「未明确」', salvWrap.children[0].children[1].children[0].textContent.includes('未明确'));
const emptyStats = run(`buildStatusBarElement({characters:[{name:"X",age:"",stats:[]}],user:null}, getSettings())`);
assert('stats 空数组也补全 5 条未明确', emptyStats.children[0].children[1].children.length === 5);
const nullStats = run(`buildStatusBarElement({characters:[{name:"Y",age:"",stats:null}],user:null}, getSettings())`);
assert('stats 为 null 也补全', nullStats.children[0].children[1].children.length === 5);

// 6. 拦截器行为
const interceptor = run('globalThis.stStatusBarInterceptor');
(async () => {
    run("getSettings().enabled = true");
    const chat = [{ is_user: true, name: 'User', mes: 'hi' }];
    await interceptor(chat, 0, () => {}, 'normal');
    assert('启用时注入协议到末条之前', chat.length === 2 && chat[0].is_system === true && chat[0].mes.includes('<StatusUpdateProtocol'));
    assert('注入位置在最新消息之前', chat[1].is_user === true);

    run("getSettings().enabled = false");
    const chat2 = [{ is_user: true, name: 'User', mes: 'hi' }];
    await interceptor(chat2, 0, () => {}, 'normal');
    assert('关闭时不注入', chat2.length === 1);

    run("getSettings().enabled = true");
    const chat3 = [{ is_user: true, name: 'User', mes: 'hi' }];
    await interceptor(chat3, 0, () => {}, 'quiet');
    assert('quiet 生成不注入（不干扰生图/摘要）', chat3.length === 1);

    console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
})();
