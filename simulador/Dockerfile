# --- Stage 1: Base ---
FROM node:24-alpine AS base
WORKDIR /usr/src/app

# --- Stage 2: Development ---
FROM base AS development
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "index.js"]

# --- Stage 3: Production ---
FROM node:24-alpine AS production
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY index.js ./

USER node
CMD ["node", "index.js"]