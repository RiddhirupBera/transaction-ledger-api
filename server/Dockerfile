FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci --workspace server --omit=dev --no-audit --no-fund
COPY --chown=node:node server/src ./server/src

ENV NODE_ENV=production PORT=3000
USER node
EXPOSE 3000
CMD ["node", "server/src/index.js"]
