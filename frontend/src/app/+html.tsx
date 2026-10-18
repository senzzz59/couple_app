import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { LAUNCH_CSS, LAUNCH_HTML, LAUNCH_JS, SPLASH, VIEWPORT, VIEWPORT_JS } from '@/lib/launchScreen';

/**
 * 让网页用起来像 App：
 * - 不显示长按图片 / 视频时浏览器自带的「复制图片 / 下载图片」菜单（Live 图要靠长按播放）
 * - 去掉点按时的灰色高亮、长按选中文字、双击放大（输入框里照常可以选字）
 */
const APP_CSS = [
  'html,body{background:#FAF7F5;margin:0;overscroll-behavior:none}',
  // 页面切换时滑进来的屏幕会暂时超出右边；iOS 会因此把整页缩小（看起来所有东西都变小），这里裁掉溢出
  '#root{min-height:100dvh;overflow:hidden;overflow:clip}',
  'html{touch-action:manipulation;-webkit-text-size-adjust:100%}',
  '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}',
  'body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}',
  'input,textarea,[contenteditable="true"]{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default}',
  'img,video{-webkit-user-drag:none;-webkit-touch-callout:none}',
  'input,textarea{font-size:16px}',
  'input:focus,textarea:focus,input:focus-visible,textarea:focus-visible{outline:none}',
].join('');

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
        <script dangerouslySetInnerHTML={{ __html: NO_MEDIA_MENU + VIEWPORT_JS }} />
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
