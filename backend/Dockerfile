FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production

# ffmpeg：把 iPhone 的 HEVC 视频 / Live 图转成所有手机都能播的 H.264，并截取视频封面。
# ca-certificates：ffmpeg 直接读对象存储里的视频（https）时校验证书。
# 默认源连不上时（服务器在国内常见）自动换成阿里云镜像；都装不上也不影响部署，只是不做视频转码。
RUN set -eux; \
    APT="-o Acquire::http::Timeout=20 -o Acquire::Retries=2"; \
    install_ffmpeg() { apt-get $APT update && apt-get $APT install -y --no-install-recommends ffmpeg ca-certificates; }; \
    if ! install_ffmpeg; then \
      sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list 2>/dev/null || true; \
      install_ffmpeg || echo 'WARNING: ffmpeg 安装失败，视频将保持原格式（不影响其它功能）'; \
    fi; \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY scripts ./scripts
COPY drizzle ./drizzle
EXPOSE 8787
CMD ["npx", "tsx", "src/index.ts"]
