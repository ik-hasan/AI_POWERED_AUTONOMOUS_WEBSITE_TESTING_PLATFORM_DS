FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY services/report-service ./services/report-service
RUN npm install --workspace=@platform/shared --workspace=@platform/report-service
RUN npm run build --workspace=@platform/shared
RUN npm run build --workspace=@platform/report-service

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/services/report-service/dist ./dist
COPY --from=builder /app/services/report-service/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@platform/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@platform/shared/
RUN mkdir -p /app/screenshots
EXPOSE 3004
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3004/health || exit 1
CMD ["node", "dist/index.js"]
