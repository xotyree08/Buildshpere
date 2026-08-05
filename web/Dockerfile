# BuildSphere web — production image.
# Build:  docker build -t buildsphere-web .
# Run:    docker run -p 3000:3000 -e DATABASE_URL=... -e AI_API_KEY=... buildsphere-web
# The same standalone bundle this image runs is verified directly in CI-less
# environments with: npm run build && node .next/standalone/server.js

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Non-root user (no shell, no home) — the app needs nothing beyond the bundle.
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
