# Image de base à jour et légère
FROM node:20-alpine

# Dossier de travail dans le conteneur
WORKDIR /app

# Copier uniquement les fichiers de dépendances d'abord
COPY package*.json ./

# Installer les dépendances en mode production
RUN npm ci --only=production

# Copier le reste du code applicatif
COPY . .

# Lancer le serveur en mode production
ENV NODE_ENV=production

# Ne PAS définir de secrets dans le Dockerfile
# Les variables JWT_SECRET et SESSION_SECRET seront passées
# via docker-compose ou l'environnement d'exécution

# Exposer le port de l'API
EXPOSE 5001

# Exécuter le process avec l'utilisateur non-root fourni par l'image
USER node

# Commande de démarrage
CMD ["node", "server.js"]
