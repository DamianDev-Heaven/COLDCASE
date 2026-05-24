# --- Stage 1: Base ---
FROM node:24-alpine AS base
WORKDIR /usr/src/app

# --- Stage 2: Development (Desarrollo local con NestJS watch y volúmenes) ---
FROM base AS development
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# --- Stage 3: Build (Compilación limpia a JavaScript) ---
FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
# Limpiamos dependencias de desarrollo y cache para producción
RUN npm prune --production && npm cache clean --force

# --- Stage 4: Production (Imagen ligera, segura y optimizada) ---
FROM node:24-alpine AS production
WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=build /usr/src/app/package*.json ./
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

# Correr como usuario no-root por seguridad
USER node

EXPOSE 3000
CMD ["node", "dist/main.js"]