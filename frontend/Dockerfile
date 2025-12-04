# ---- Étape 1 : build de l'application React ----
FROM node:20-alpine AS build

# Dossier de travail
WORKDIR /app

# Copie des fichiers de dépendances
COPY package*.json ./

# Installation des dépendances (mode prod)
RUN npm ci --only=production

# Copie du reste du code
COPY . .

# Build de l'application
RUN npm run build


# ---- Étape 2 : image de runtime minimale, non-root ----
FROM node:20-alpine AS runtime

WORKDIR /app

# Installation de "serve" pour servir le build statique
RUN npm install -g serve@14

# Copie du build uniquement
COPY --from=build /app/build ./build

# Utilisateur non-root fourni par l'image officielle node
USER node

EXPOSE 3000

# Commande de démarrage
CMD ["serve", "-s", "build", "-l", "3000"]
