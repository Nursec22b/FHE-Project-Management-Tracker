# Stage 1: Build the frontend
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Build the backend
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Stage 3: Production image
FROM node:20-alpine AS production
WORKDIR /app

# Install production server dependencies only
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy built backend
COPY --from=server-build /app/server/dist ./server/dist

# Copy built frontend
COPY --from=client-build /app/client/build ./client/build

# Create uploads directory
RUN mkdir -p uploads

# Environment defaults
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

CMD ["node", "server/dist/index.js"]
