// 从品牌 SVG 渲染 1024x1024 源图，再由 `npm run tauri icon` 生成全套图标
// 图形：字母 J 与对勾融合的连续线条（按用户设计方案：J 竖笔向下，
// 底部向左弯出 U 型钩，长勾自竖笔底部向右上扬起，同色同宽自然融合）
import { Resvg } from '@resvg/resvg-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(here, '..', 'src-tauri', 'icons', 'app-icon-1024.png')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="96" y="96" width="832" height="832" rx="192" fill="#FFFFFF"/>
  <!-- J：竖笔自上而下，底部圆滑左拐成 U 型钩，左臂圆头收尾 -->
  <path d="M512 306 V545 C512 662 470 720 378 720 C318 720 306 690 306 640 V590"
        fill="none" stroke="#5B8DEF" stroke-width="96" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- 对勾：自竖笔底部向右上扬起的长勾，与 J 底部融合 -->
  <path d="M492 660 L722 455"
        fill="none" stroke="#5B8DEF" stroke-width="96" stroke-linecap="round"/>
</svg>`

const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } })
const png = resvg.render().asPng()
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, png)
console.log('icon source written:', outPath)
