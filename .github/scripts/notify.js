/* 比對兩個 commit 之間 index.html 裡的 shops 陣列，找出「新增」的店家。
 *
 * 用解析物件的方式，而不是比對 diff 的文字行 —— 這樣改價格、改營業時間、
 * 調整排版或刪掉店家，都不會被誤判成新增。已用 repo 的真實 commit 驗證過。
 *
 * 用法：node notify.js <before-sha> <after-sha> <test?>
 * 產出：GITHUB_OUTPUT 的 count / subject，以及信件內容 body.html
 */
const { execSync } = require('child_process');
const fs = require('fs');

const BASE = 'https://kellytseng-beep.github.io/bento-catalog/';
const [before, after, testFlag] = process.argv.slice(2);
const isTest = testFlag === 'true';

function shopsAt(ref) {
  if (!ref || /^0+$/.test(ref)) return null;          // 空值或全零（分支首次 push）
  let html;
  try {
    html = execSync(`git show ${ref}:index.html`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;                                       // 該 commit 不存在
  }
  const m = html.match(/const shops = \[[\s\S]*?\n\];/);
  if (!m) return null;
  try {
    const arr = eval('(' + m[0].replace('const shops =', '').replace(/;\s*$/, '') + ')');
    return arr.filter(s => s && s.name && s.name !== '店名');   // 排除範本區塊
  } catch {
    return null;
  }
}

function out(key, value) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
  console.log(`  ${key}=${value}`);
}

const curr = shopsAt(after);
const prev = shopsAt(before);

let added = [];
if (!curr) {
  console.log('讀不到目前版本的 shops 陣列，中止（不寄信）。');
} else if (isTest) {
  added = curr.slice(-1);
  console.log('測試模式：拿最後一家店當範例寄一封，不代表真的有新增。');
} else if (!prev) {
  console.log('讀不到前一個版本（可能是分支第一次 push），不寄信，以免把整份清單當成新增。');
} else {
  const had = new Set(prev.map(s => s.name));
  added = curr.filter(s => !had.has(s.name));
  console.log(`前一版 ${prev.length} 家 → 這一版 ${curr.length} 家，新增 ${added.length} 家。`);
}

out('count', added.length);

if (!added.length) {
  console.log('沒有新店，不寄信。');
  process.exit(0);
}

const names = added.map(s => s.name).join('、');
out('subject', (isTest ? '［測試］' : '') + '便當目錄新增了：' + names);

// 給 workflow 拿去輪詢線上網頁用：確認這個店名真的出現在 Pages 上了才寄信
out('needle', added[0].name);

const rows = added.map(s => {
  const anchor = 'shop-' + (curr.indexOf(s) + 1);
  const sub = [s.area, s.address].filter(Boolean).join('・');
  return `<li style="margin:0 0 14px">
      <a href="${BASE}#${anchor}"
         style="color:#7E2F26;font-weight:700;font-size:17px;text-decoration:none">${s.stamp} ${s.name}</a>
      <div style="color:#6B5F4E;font-size:13px;margin-top:2px">${sub}</div>
    </li>`;
}).join('');

fs.writeFileSync('body.html', `<div style="font-family:system-ui,'Microsoft JhengHei',sans-serif;line-height:1.6;color:#332A22;background:#F8F3E6;padding:24px;border-radius:8px">
  <p style="margin:0 0 16px">便當目錄多了 ${added.length} 家店：</p>
  <ul style="padding-left:18px;margin:0 0 20px">${rows}</ul>
  <p style="margin:0">
    <a href="${BASE}" style="color:#56635F;font-weight:700">看完整目錄 →</a>
  </p>
</div>`);

console.log('信件內容已寫入 body.html');
