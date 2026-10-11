FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/shared-types/package*.json ./packages/shared-types/
COPY apps/web/package*.json ./apps/web/

RUN npm install

COPY packages/shared-types ./packages/shared-types
RUN npm run build --workspace=@nexgen/shared-types

COPY apps/web ./apps/web
RUN npm run build --workspace=@nexgen/web

FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $$uri $$uri/ /index.html; \
    } \
    location /api/ { \
        proxy_pass http://api:4000; \
        proxy_set_header Host $$host; \
        proxy_set_header X-Real-IP $$remote_addr; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
