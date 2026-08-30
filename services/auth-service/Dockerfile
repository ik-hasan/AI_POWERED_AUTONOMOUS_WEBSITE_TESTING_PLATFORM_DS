FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY services/auth-service ./services/auth-service
RUN npm install --workspace=@platform/shared --workspace=@platform/auth-service
RUN npm run build --workspace=@platform/shared
RUN npm run build --workspace=@platform/auth-service

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/services/auth-service/dist ./dist
COPY --from=builder /app/services/auth-service/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@platform/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@platform/shared/
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "dist/index.js"]
