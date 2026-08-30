FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY services/execution-service ./services/execution-service
RUN npm install --workspace=@platform/shared --workspace=@platform/execution-service
RUN npm run build --workspace=@platform/shared
RUN npm run build --workspace=@platform/execution-service

FROM mcr.microsoft.com/playwright:v1.61.1-jammy
WORKDIR /app
COPY --from=builder /app/services/execution-service/dist ./dist
COPY --from=builder /app/services/execution-service/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@platform/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@platform/shared/
RUN mkdir -p /app/screenshots
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3003/health || exit 1
CMD ["node", "dist/index.js"]
