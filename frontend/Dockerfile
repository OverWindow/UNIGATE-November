FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY next.config.js postcss.config.js tsconfig.json ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginx:stable-alpine AS runtime

ENV BACKEND_ORIGIN=http://host.docker.internal:8000 PUBLIC_SCHEME=http
COPY nginx.conf /etc/nginx/nginx.conf.template
COPY scripts/start-nginx.sh /usr/local/bin/start-nginx.sh
COPY --from=build /app/out /usr/share/nginx/html

# Serve static files without root privileges. / 일반 사용자 권한으로 정적 파일을 제공합니다.
USER nginx
EXPOSE 8080
ENTRYPOINT ["sh", "/usr/local/bin/start-nginx.sh"]
