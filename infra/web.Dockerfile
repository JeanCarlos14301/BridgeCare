FROM node:22.19.0-alpine AS build
# Mirror the repository layout: the UI imports generated types from packages/contracts.
WORKDIR /repo/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY packages/contracts /repo/packages/contracts
COPY apps/web/ ./
RUN npm run build

FROM nginx:1.29.1-alpine
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
