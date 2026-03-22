# ---- Stage 1: Build ----
FROM node:22-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json package-lock.json ./

# Installer les dépendances
RUN npm ci

# Copier le code source
COPY . .

# Build de production
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- Stage 2: Serve ----
FROM nginx:alpine

# Copier la config nginx personnalisée
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier le build depuis le stage précédent
COPY --from=builder /app/dist /usr/share/nginx/html

# Exposer le port (Railway utilise $PORT)
EXPOSE 80

# Script d'entrée pour gérer le PORT dynamique de Railway
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
