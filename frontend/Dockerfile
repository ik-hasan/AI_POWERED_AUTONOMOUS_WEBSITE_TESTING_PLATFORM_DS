FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY frontend ./frontend
RUN npm install --workspace=@platform/frontend
ARG VITE_API_URL=http://localhost:3000/api
ARG VITE_WS_URL=http://localhost:3005
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
RUN npm run build --workspace=@platform/frontend

FROM nginx:alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1
