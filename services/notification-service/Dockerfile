FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY services/notification-service ./services/notification-service
RUN npm install --workspace=@platform/shared --workspace=@platform/notification-service
RUN npm run build --workspace=@platform/shared
RUN npm run build --workspace=@platform/notification-service

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/services/notification-service/dist ./dist
COPY --from=builder /app/services/notification-service/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@platform/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@platform/shared/
EXPOSE 3005
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3005/health || exit 1
CMD ["node", "dist/index.js"]
