import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();
  return (
    <html {...htmlAttributes} lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>us. — 只属于我们两个人</title>
        <meta name="description" content="记录一起吃过的店、重要的日子和日常的小瞬间。" />
        <meta name="theme-color" content="#FFF7F5" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="us." />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/icon.png" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: 'html,body{background:#FFF7F5;margin:0;overscroll-behavior:none}#root{min-height:100dvh}input,textarea{font-size:16px}input:focus,textarea:focus{outline:none}input:focus-visible,textarea:focus-visible{outline:none}*{box-sizing:border-box}' }} />
        <script src="/web-build.js" />
        {headNodes}
      </head>
      <body {...bodyAttributes}>{children}{bodyNodes}</body>
    </html>
  );
}
