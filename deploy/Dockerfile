FROM node:22-slim

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY packages/core/package.json packages/core/
COPY packages/sqlite-store/package.json packages/sqlite-store/
COPY packages/pg-store/package.json packages/pg-store/
COPY packages/server/package.json packages/server/
COPY packages/sdk/package.json packages/sdk/
COPY packages/cli/package.json packages/cli/
COPY packages/dashboard/package.json packages/dashboard/

# Install dependencies
RUN npm ci --ignore-scripts
RUN npm rebuild better-sqlite3

# Copy source
COPY . .

# Build all packages
RUN npm run build

# Expose port
EXPOSE 7437

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:7437/health || exit 1

# Start server
CMD ["node", "--env-file=.env.production", "packages/server/dist/bin.js"]
