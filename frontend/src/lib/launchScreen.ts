/**
 * 网页版启动动画：写在 HTML 里，JS 还没下载完就能显示。
 * 两个团子从两边蹦过来，贴贴脸，眯眼笑，中间冒出一颗爱心，然后淡出进入 App。
 *
 * 第一帧（两个团子分开站着）和 iPhone 主屏幕启动图一致，所以从系统启动图切到动画是无缝的。
 * scripts/generate-splash.mjs 用同一份标记生成 assets/pwa/splash-*.png。
 */

// iPhone / iPad 从主屏幕打开时的启动画面（按屏幕尺寸匹配，竖屏）。由 scripts/generate-splash.mjs 生成
export const SPLASH: [number, number, number][] = [
  [440, 956, 3],
  [402, 874, 3],
  [420, 912, 3],
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 3],
  [414, 896, 2],
  [360, 780, 3],
  [375, 667, 2],
  [744, 1133, 2],
  [768, 1024, 2],
  [810, 1080, 2],
  [820, 1180, 2],
  [834, 1194, 2],
  [834, 1210, 2],
  [1024, 1366, 2],
  [1032, 1376, 2],
];

const BG = '#FAF7F5';

/** 团子身体（viewBox 0 0 100 100），和 components/Mascot.tsx 保持一致 */
const blob = (who: 'him' | 'her') => {
  const color = who === 'her' ? '#F9B4C4' : '#FBD5BF';
  const top =
    who === 'her'
      ? '<path d="M66 20 L56 12 Q53 18 56 24 Z" fill="#F27B96"/><path d="M66 20 L77 13 Q80 19 76 25 Z" fill="#F27B96"/><ellipse cx="66" cy="19.5" rx="3.6" ry="3.4" fill="#E5627F"/>'
      : '<path d="M50 18 Q49 11 51 6" stroke="#79B572" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M51 9 Q58 2 64 7 Q58 13 51 9 Z" fill="#8FC488"/><path d="M50 11 Q43 5 38 10 Q44 15 50 11 Z" fill="#8FC488"/>';
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${top}<path d="M50 16 C77 16 92 38 92 62 C92 84 74 93 50 93 C26 93 8 84 8 62 C8 38 23 16 50 16 Z" fill="${color}"/><ellipse cx="34" cy="36" rx="7" ry="4" fill="#fff" opacity=".45" transform="rotate(-30 34 36)"/><g class="ul-open"><ellipse class="ul-eye" cx="38" cy="54" rx="4.2" ry="5" fill="#4B2E35"/><ellipse class="ul-eye" cx="62" cy="54" rx="4.2" ry="5" fill="#4B2E35"/></g><g class="ul-happy" stroke="#4B2E35" stroke-width="3.2" stroke-linecap="round" fill="none"><path d="M33 56 Q38 50 43 56"/><path d="M57 56 Q62 50 67 56"/></g><ellipse class="ul-cheek" cx="27" cy="64" rx="7" ry="4.2" fill="#F27B96"/><ellipse class="ul-cheek" cx="73" cy="64" rx="7" ry="4.2" fill="#F27B96"/><path d="M45 63 Q50 68 55 63" stroke="#4B2E35" stroke-width="2.8" stroke-linecap="round" fill="none"/></svg>`;
};

const heart = (cls: string) =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.2s-7.7-4.7-9.8-9.4C.7 8.5 2.7 4.3 6.6 4.3c2.3 0 3.7 1.3 5.4 3.3 1.7-2 3.1-3.3 5.4-3.3 3.9 0 5.9 4.2 4.4 7.5-2.1 4.7-9.8 9.4-9.8 9.4z" fill="currentColor"/><ellipse cx="7.4" cy="8.6" rx="1.7" ry="1.1" fill="#fff" opacity=".55" transform="rotate(-30 7.4 8.6)"/></svg>`;

export const LAUNCH_HTML = `<div id="us-launch" role="presentation"><div class="ul-stage"><div class="ul-blob ul-him"><div class="ul-sway">${blob('him')}</div></div><div class="ul-blob ul-her"><div class="ul-sway">${blob('her')}</div></div>${heart('ul-heart')}${heart('ul-mini ul-m1')}${heart('ul-mini ul-m2')}</div><div class="ul-word">us.</div></div>`;

// 时间线：0–0.8s 两边各蹦两下靠近 → 0.8s 贴脸、眯眼、脸红 → 0.85s 爱心弹出 → 0.95s 出现 us. → 之后轻轻摇摆直到 App 就绪
export const LAUNCH_CSS = [
  `#us-launch{position:fixed;inset:0;z-index:2147483000;background:${BG};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;transition:opacity .4s ease,transform .4s ease;padding-bottom:4vh}`,
  '#us-launch.out{opacity:0;transform:scale(1.05);pointer-events:none}',
  '.ul-stage{position:relative;width:200px;height:150px}',
  '.ul-blob{position:absolute;bottom:0;width:100px;height:100px;transform-origin:50% 92%}',
  '.ul-blob svg{display:block;width:100%;height:100%;overflow:visible}',
  '.ul-sway{width:100%;height:100%;transform-origin:50% 92%}',
  '.ul-him{left:8px;transform:translateX(-46px);animation:ul-him 0.8s cubic-bezier(.35,.6,.45,1) .1s both}',
  '.ul-her{right:8px;z-index:1;transform:translateX(46px);animation:ul-her 0.8s cubic-bezier(.35,.6,.45,1) .16s both}',
  '.ul-him .ul-sway{animation:ul-lean-l .3s ease .82s both,ul-sway-l 2.6s ease-in-out 1.2s infinite alternate}',
  '.ul-her .ul-sway{animation:ul-lean-r .3s ease .82s both,ul-sway-r 2.6s ease-in-out 1.2s infinite alternate}',
  '@keyframes ul-lean-l{from{transform:none}to{transform:rotate(5deg)}}',
  '@keyframes ul-lean-r{from{transform:none}to{transform:rotate(-5deg)}}',
  // 两下蹦跳：起跳拉长、落地压扁，最后一下贴到一起
  '@keyframes ul-him{0%{transform:translateX(-46px)}22%{transform:translate(-34px,-20px) scale(.95,1.06)}42%{transform:translate(-24px,0) scale(1.07,.93)}64%{transform:translate(-10px,-16px) scale(.96,1.05)}84%{transform:translate(2px,0) scale(1.08,.92)}100%{transform:translate(0,0)}}',
  '@keyframes ul-her{0%{transform:translateX(46px)}22%{transform:translate(34px,-20px) scale(.95,1.06)}42%{transform:translate(24px,0) scale(1.07,.93)}64%{transform:translate(10px,-16px) scale(.96,1.05)}84%{transform:translate(-2px,0) scale(1.08,.92)}100%{transform:translate(0,0)}}',
  '@keyframes ul-sway-l{from{transform:rotate(5deg)}to{transform:rotate(1deg) translateY(-3px)}}',
  '@keyframes ul-sway-r{from{transform:rotate(-5deg)}to{transform:rotate(-1deg) translateY(-3px)}}',
  // 分开时偶尔眨眼，贴脸后换成眯眼笑
  '.ul-eye{transform-box:fill-box;transform-origin:center;animation:ul-blink .5s ease .3s 1}',
  '@keyframes ul-blink{0%,100%{transform:scaleY(1)}40%{transform:scaleY(.12)}}',
  '.ul-happy{opacity:0;animation:ul-show .01s linear .9s forwards}',
  '.ul-open{animation:ul-hide .01s linear .9s forwards}',
  '.ul-cheek{opacity:.55;animation:ul-blush .4s ease .88s forwards}',
  '@keyframes ul-show{to{opacity:1}}',
  '@keyframes ul-hide{to{opacity:0}}',
  '@keyframes ul-blush{to{opacity:.9}}',
  // 爱心：弹出后一直轻轻跳
  '.ul-heart{position:absolute;left:50%;top:0;width:34px;height:34px;margin-left:-17px;color:#F27B96;transform:scale(0);animation:ul-pop .5s cubic-bezier(.3,1.6,.5,1) .92s forwards,ul-beat 1.1s ease-in-out 1.6s infinite}',
  '@keyframes ul-pop{0%{transform:translateY(16px) scale(0)}100%{transform:translateY(0) scale(1)}}',
  '@keyframes ul-beat{0%,100%{transform:scale(1)}15%{transform:scale(1.18)}30%{transform:scale(.96)}45%{transform:scale(1.08)}}',
  '.ul-mini{position:absolute;left:50%;top:22px;width:14px;height:14px;opacity:0}',
  '.ul-m1{color:#F9B4C4;animation:ul-float 2.2s ease-out 1.1s infinite}',
  '.ul-m2{color:#E5627F;animation:ul-float2 2.2s ease-out 1.8s infinite}',
  '@keyframes ul-float{0%{opacity:0;transform:translate(-22px,10px) scale(.5)}20%{opacity:1}100%{opacity:0;transform:translate(-40px,-40px) scale(1)}}',
  '@keyframes ul-float2{0%{opacity:0;transform:translate(6px,10px) scale(.5)}20%{opacity:1}100%{opacity:0;transform:translate(26px,-44px) scale(1)}}',
  '.ul-word{font:800 28px/1 ui-rounded,"SF Pro Rounded","Nunito",system-ui,sans-serif;color:#2A1F23;letter-spacing:.5px;opacity:0;transform:translateY(8px);animation:ul-word .5s ease .95s forwards}',
  '@keyframes ul-word{to{opacity:1;transform:none}}',
  // 静止帧：生成启动图时用
  '#us-launch.still *{animation:none!important}',
  '@media (prefers-reduced-motion:reduce){#us-launch *{animation-duration:.01s!important;animation-delay:0s!important;animation-iteration-count:1!important}}',
].join('');

/**
 * 至少播完贴贴和爱心（约 1.3 秒）再淡出；App 卡住时最多 8 秒也会让开，避免一直挡住页面。
 * App 准备好后调用 window.__usHideLaunch()。
 */
export const LAUNCH_JS = `(function(){var t0=Date.now(),done=false,reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches,MIN=reduce?0:1350;function hide(){if(done)return;done=true;setTimeout(function(){var el=document.getElementById('us-launch');if(!el)return;el.classList.add('out');setTimeout(function(){el.remove()},450)},Math.max(0,MIN-(Date.now()-t0)))}window.__usHideLaunch=hide;setTimeout(hide,8000)})();`;

/**
 * iOS 会把横向超出屏幕的页面整体缩小来「适应宽度」，而且之后不会自己恢复（iPhone 上看起来就是整页变小）。
 * 页面本身已经裁掉了切换动画造成的溢出；这里再兜底：发现被缩小了就把 viewport 标签删掉重新插入（iOS 只认新插入的标签），
 * 一秒后还不对就换成写死数字宽度的版本。
 * 有的打开方式（比如 iPhone 上从 Chrome 添加到主屏幕）只有 clientWidth / visualViewport.width 能看出被缩小；
 * 收起键盘后、以及每隔几秒也检查一次（没被缩小时什么都不做）。
 */
export const VIEWPORT = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
export const VIEWPORT_JS = `(function(){if(!(navigator.maxTouchPoints>1))return;var V=${JSON.stringify(VIEWPORT)},last=0;function expected(){var s=Math.min(screen.width,screen.height),l=Math.max(screen.width,screen.height);return window.innerWidth>window.innerHeight?l:s}function zoomed(){var exp=expected(),vv=window.visualViewport,cw=document.documentElement.clientWidth;return window.innerWidth>exp+2||cw>exp+2||!!(vv&&(vv.scale<0.98||vv.width>exp+2))}function reset(c){var old=document.querySelector('meta[name=viewport]'),m=document.createElement('meta');m.name='viewport';m.content=c;if(old)old.remove();document.head.appendChild(m)}function check(){if(Date.now()-last<1500||!zoomed())return;var exp=expected();{last=Date.now();reset(V);setTimeout(function(){if(zoomed())reset(V.replace('width=device-width','width='+Math.round(exp)))},1000)}}window.addEventListener('resize',check);window.addEventListener('orientationchange',function(){setTimeout(check,300)});window.addEventListener('pageshow',check);document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(check,100)});if(window.visualViewport)visualViewport.addEventListener('resize',check);window.addEventListener('load',function(){setTimeout(check,500)});document.addEventListener('focusout',function(){setTimeout(check,350)});setInterval(function(){if(!document.hidden)check()},3000)})();`;
