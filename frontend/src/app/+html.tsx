import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { DESKTOP_MODE_JS, LAUNCH_CSS, LAUNCH_HTML, LAUNCH_JS, SPLASH, VIEWPORT, VIEWPORT_JS } from '@/lib/launchScreen';

/**
 * 让网页用起来像 App：
 * - 不显示长按图片 / 视频时浏览器自带的「复制图片 / 下载图片」菜单（Live 图要靠长按播放）
 * - 去掉点按时的灰色高亮、长按选中文字、双击放大（输入框里照常可以选字）
 */
const APP_CSS = [
  // 弹层（Modal）挂在 body 上、不在 #root 里：html / body 也要裁掉横向溢出，否则 iOS 会把整页缩小
  'html,body{background:#FAF7F5;margin:0;overscroll-behavior:none;overflow:hidden;overflow:clip}',
  // 页面切换时滑进来的屏幕会暂时超出右边；iOS 会因此把整页缩小（看起来所有东西都变小），这里裁掉溢出。
  // 高度严格等于可见区域（html/body/#root 都是 100%）：不用 100dvh，安卓刷新后它可能比屏幕高，底部标签栏会被裁掉一截
  '#root{height:100%;overflow:hidden;overflow:clip}',
  'html{touch-action:manipulation;-webkit-text-size-adjust:100%}',
  '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}',
  'body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}',
  'input,textarea,[contenteditable="true"]{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default}',
  'img,video{-webkit-user-drag:none;-webkit-touch-callout:none}',
  'input,textarea{font-size:16px}',
  'input:focus,textarea:focus,input:focus-visible,textarea:focus-visible{outline:none}',
].join('');

// 整页本身从不滚动（滚动都在页面里面）：刷新后不要恢复上次的滚动位置，否则 iOS 上整页错位、底部标签栏被挤出屏幕
const NO_SCROLL_RESTORE = `try{history.scrollRestoration='manual'}catch(e){}window.addEventListener('pageshow',function(){if(window.scrollY)window.scrollTo(0,0)});`;

// 刷新后安卓偶尔拿到过时的屏幕高度（切后台再回来才恢复）：加载后再量几次，页面和可见区域对不上就让浏览器重新计算。
// 只在安卓上做：iPhone 从主屏幕打开时（全屏）这两个高度本来就对不上，往 viewport 里写 height 会让 iOS 按两倍宽排版、整页缩小，而且改回去也不恢复。
const FIT_VIEWPORT = `(function(){if(!/Android/i.test(navigator.userAgent))return;function fit(){var d=document.documentElement,r=document.getElementById('root');if(!r)return;if(Math.abs(r.offsetHeight-d.clientHeight)>1){var m=document.querySelector('meta[name=viewport]');if(m){var v=m.getAttribute('content');m.setAttribute('content',v+',height=device-height');requestAnimationFrame(function(){m.setAttribute('content',v)})}}window.dispatchEvent(new Event('resize'))}function soon(){setTimeout(fit,300);setTimeout(fit,1200)}window.addEventListener('load',soon);window.addEventListener('pageshow',function(e){if(e.persisted)soon()})})();`;

const NO_MEDIA_MENU = `document.addEventListener('contextmenu',function(e){var t=e.target;if(t&&t.closest&&t.closest('img,video,[data-media]'))e.preventDefault();},{capture:true});`;

export default function Root({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();
  return (
    <html {...htmlAttributes} lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content={VIEWPORT} />
        <title>us.</title>
        <meta name="description" content="只属于我们两个人。" />
        <meta name="theme-color" content="#FAF7F5" />
        <meta name="color-scheme" content="light" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="us." />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        {SPLASH.map(([w, h, r]) => (
          <link
            key={`${w}x${h}@${r}`}
            rel="apple-touch-startup-image"
            media={`(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`}
            href={`/icons/splash-${w * r}x${h * r}.png`}
          />
        ))}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: APP_CSS }} />
        <style dangerouslySetInnerHTML={{ __html: LAUNCH_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: NO_SCROLL_RESTORE + FIT_VIEWPORT + NO_MEDIA_MENU + DESKTOP_MODE_JS + VIEWPORT_JS }} />
        <script src="/web-build.js" />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {/* 启动动画：在 JS 加载前就显示，App 就绪后由 hideLaunch() 淡出 */}
        <div dangerouslySetInnerHTML={{ __html: LAUNCH_HTML }} style={{ display: 'contents' }} />
        <script dangerouslySetInnerHTML={{ __html: LAUNCH_JS }} />
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
