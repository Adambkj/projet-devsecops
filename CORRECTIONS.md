## 1. Corrections Backend – server.js
**1.1 Suppression de la route /api/debug**

Avant :
```
app.get('/api/debug', (req, res) => {
    res.json(process.env);
});
```

Après :
```
// Route supprimée car elle exposait des secrets
```
**1.2 Protection de l’endpoint /api/users**

Avant :
```
app.get('/api/users', (req, res) => {
    res.json(users);
});
```

Après :
```
app.get('/api/users', authMiddleware, (req, res) => {
    res.json(safeUsers);
});
```
**1.3 Blocage de l’IDOR /api/users/:id**

Avant :
```
app.get('/api/users/:id', (req, res) => {
    res.json(users[id]);
});
```

Après :
```
app.get('/api/users/:id', authMiddleware, (req, res) => {
    if (req.user.id !== Number(req.params.id) && req.user.role !== "admin") {
        return res.status(403).json({ message: "Accès interdit" });
    }
    res.json(safeUser);
});
```
## 2. Corrections – Frontend (`frontend/src/App.js`)

### 2.1 Suppression de `eval()` dans la recherche de produits

**Avant (vulnérable)**

```js
const handleSearch = async () => {
  try {
    const filtered = products.filter(p => {
      try {
        return eval(`p.name.toLowerCase().includes('${searchQuery}'.toLowerCase())`);
      } catch(e) {
        return false;
      }
    });
    setProducts(filtered);
  } catch (error) {
    console.error('Erreur recherche:', error);
  }
};
```
Après (branche secure)

```js

const handleSearch = async () => {
  try {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      await loadProducts();
      return;
    }

    const filtered = products.filter((p) =>
      p.name.toLowerCase().includes(query)
    );

    setProducts(filtered);
  } catch (error) {
    console.error('Erreur recherche:', error);
  }
};
```
On n’exécute plus de code dynamique côté client, on se contente de filtrer la liste en JavaScript.

### 2.2 Suppression de dangerouslySetInnerHTML (XSS)
Avant

```js
<h3 dangerouslySetInnerHTML={{ __html: product.name }}></h3>

<div
  className="review-comment"
  dangerouslySetInnerHTML={{ __html: review.comment }}
/>
```
Après

```js
<h3>{product.name}</h3>

<div className="review-comment">
  {review.comment}
</div>
```
Les données sont maintenant rendues comme du texte, ce qui bloque l’injection de HTML/JS malveillant.

### 2.3 Suppression de la clé API côté frontend
Avant

```js
const API_KEY = 'frontend-api-key-123456';

const response = await fetch(`${API_URL}/login`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY
  },
  body: JSON.stringify({ username, password })
});
```
Après

```js
const response = await fetch(`${API_URL}/login`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ username, password })
});
```
La clé sensible n’est plus stockée côté client. L’authentification se base uniquement sur les identifiants utilisateur et les contrôles backend.

### 2.4 Réduction de l’exposition des tokens (localStorage → sessionStorage)
Avant

```js
const token = localStorage.getItem('token');
const userData = localStorage.getItem('user');

if (token && userData) {
  setUser(JSON.parse(userData));
}

localStorage.setItem('token', data.token);
localStorage.setItem('user', JSON.stringify(data.user));
```
Après

```js
const storedToken = sessionStorage.getItem('token');
const storedUser = sessionStorage.getItem('user');

if (storedToken && storedUser) {
  setToken(storedToken);
  setUser(JSON.parse(storedUser));
}

sessionStorage.setItem('token', data.token);
sessionStorage.setItem('user', JSON.stringify(data.user));
```
Le token n’est plus persistant après fermeture du navigateur, ce qui limite l’impact d’un vol de token. (Idéalement, il serait placé dans un cookie HttpOnly côté backend.)

### 2.5 Suppression des logs de données sensibles
Avant

```js
useEffect(() => {
  console.log('User data:', user);
  console.log('API Key:', API_KEY);
  console.log('JWT Token:', localStorage.getItem('token'));
}, [user]);
```
Après

```js
// Les logs sensibles ont été supprimés dans la branche secure.
```
Les informations sensibles ne sont plus exposées dans la console du navigateur.

### 2.6 Suppression de l’IDOR dans la vue Profil
Avant

```js
<input
  id="userId"
  type="number"
  placeholder="ID utilisateur"
  style={{ marginRight: '10px' }}
/>
<button onClick={async () => {
  const userId = document.getElementById('userId').value;
  const response = await fetch(`${API_URL}/users/${userId}`);
  const data = await response.json();
  alert(JSON.stringify(data, null, 2));
}}>
  Voir profil
</button>
```
Après

```js
{view === 'profile' && user && (
  <div className="profile-view">
    <h2>Mon Profil</h2>
    <pre style={{ textAlign: 'left', background: '#f5f5f5', padding: '20px' }}>
      {JSON.stringify(user, null, 2)}
    </pre>
    {/* Le champ userId et l’appel direct à /users/:id ont été supprimés. */}
  </div>
)}
```
On ne permet plus de consulter arbitrairement les profils des autres utilisateurs via /users/:id depuis l’interface.

### 2.7 Logique de paiement sécurisée (suppression de la carte en clair)
Avant

```js
const creditCard = prompt('Entrez votre numéro de carte bancaire:');

if (!creditCard) return;

body: JSON.stringify({
  userId: user.id,
  productId: product.id,
  quantity: 1,
  creditCard: creditCard
});
```
Après

```js

if (!token || !user) {
  alert('Vous devez être connecté pour passer commande.');
  return;
}

body: JSON.stringify({
  userId: user.id,
  productId: product.id,
  quantity: 1,
  // Dans une vraie appli : token de paiement sécurisé (Stripe/PayPal)
  paymentToken: 'secure-payment-token'
});
```
Le numéro de carte n’est plus saisi ni transmis en clair. La logique simule l’usage d’un prestataire de paiement sécurisé.

---
## 3. Dockerfile (frontend)

**Problèmes identifiés :**
- Image de base non versionnée / potentiellement obsolète.
- Build et exécution dans la même image (surface d’attaque plus grande).
- Conteneur exécuté en root.
- Copie de tout le projet dans l’image finale (code + devDependencies).

**Corrections apportées :**
- Remplacement de `node:16` par `node:20-alpine` (image légère et à jour).
- Mise en place d’un build multi-stage :
  - Étape `build` pour `npm ci` + `npm run build`.
  - Étape `runtime` minimale qui ne contient que le dossier `build` et `serve`.
- Exécution du conteneur avec l’utilisateur non-root `node` via `USER node`.
- Réduction de la taille et de la surface d’attaque en ne gardant que les artefacts nécessaires (build React + serve).

## 4. Dockerfile (backend)

**Problèmes identifiés :**
- Utilisation de `node:16` sans version précise ni image légère.
- Installation des dépendances avec `npm install` (moins reproductible).
- Secrets (`JWT_SECRET`, `SESSION_SECRET`) codés en dur dans le Dockerfile.
- Conteneur exécuté en root.
- Copie de tout le projet avant installation des dépendances (cache Docker moins efficace).

**Corrections apportées :**
- Remplacement de `FROM node:16` par `FROM node:20-alpine` pour une image plus récente et légère.
- Utilisation de `npm ci --only=production` pour une installation reproductible des dépendances en mode production.
- Suppression des secrets du Dockerfile : `JWT_SECRET` et `SESSION_SECRET` seront fournis via des variables d’environnement (ex. `docker-compose.yml` ou l’orchestrateur).
- Ajout de `USER node` pour ne plus exécuter le serveur en root dans le conteneur.
- Optimisation du cache Docker en copiant d’abord `package*.json`, puis le reste du code.
- Conservation de `ENV NODE_ENV=production` et `EXPOSE 5001` uniquement pour la configuration d’exécution.

### docker-compose.yml – Secrets en clair et mauvaise configuration réseau

**Avant :**

Les secrets étaient écrits en clair dans `docker-compose.yml` et la BDD MongoDB était exposée directement sur l’hôte :

```
services:
  mongodb:
    image: mongo:5.0
    ports:
      - "27017:27017"


  backend:
    environment:
      - NODE_ENV=development
      - JWT_SECRET=my-super-secret-jwt-key-12345
      - SESSION_SECRET=my-session-secret-key
      - MONGODB_URI=mongodb://mongodb:27017/ecommerce

  frontend:
    environment:
      - REACT_APP_API_URL=http://localhost:5001
      - REACT_APP_API_KEY=frontend-api-key-123456
```
Cela posait plusieurs problèmes de sécurité :
- Exposition directe de MongoDB sur le port 27017 depuis l’extérieur.
- Secrets (JWT, session) en clair dans le fichier de configuration versionné.
- URL d’API du frontend mal configurée (localhost au lieu du service Docker).
- Clé “API” inutilisée dans le frontend et présente en clair.

**Après :**

Nous avons externalisé tous les secrets dans un fichier .env non commité et limité l’exposition réseau :
```
services:
  mongodb:
    image: mongo:5.0
    restart: unless-stopped
    volumes:
      - mongodb_data:/data/db
    networks:
      - app-network

  backend:
    build: ./backend
    restart: unless-stopped
    depends_on:
      - mongodb
    environment:
      NODE_ENV: production
      JWT_SECRET: ${JWT_SECRET}
      SESSION_SECRET: ${SESSION_SECRET}
      MONGODB_URI: ${MONGODB_URI}
    networks:
      - app-network
    ports:
      - "5001:5001"

  frontend:
    build: ./frontend
    restart: unless-stopped
    depends_on:
      - backend
    environment:
      REACT_APP_API_URL: ${REACT_APP_API_URL}
    networks:
      - app-network
    ports:
      - "3000:3000"
```
Les valeurs sont maintenant chargées depuis un fichier .env :
```
JWT_SECRET=change-me-super-secret-jwt
SESSION_SECRET=change-me-session-secret
MONGODB_URI=mongodb://mongodb:27017/ecommerce
REACT_APP_API_URL=http://backend:5001
```
**Correction / justification :**

- Les secrets ne sont plus stockés en clair dans docker-compose.yml mais dans des variables d’environnement.
- MongoDB n’est plus exposé sur l’hôte, uniquement accessible via le réseau Docker interne (app-network).
- Le frontend appelle maintenant le backend via le nom du service Docker (http://backend:5001) et plus via localhost.
- Nous avons supprimé la pseudo “clé API” côté frontend, aligné avec la correction du code React qui ne l’utilise plus.
- Ajout de restart: unless-stopped pour une meilleure résilience en production.



