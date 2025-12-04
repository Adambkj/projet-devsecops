const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5001;

// Config sécurisée via variables d'environnement
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-session-secret';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

// "Base de données" en mémoire (simulation)
const db = {
  users: [],
  products: [],
  orders: [],
  reviews: []
};

// Paramètre de hashage pour les mots de passe
const SALT_ROUNDS = 10;

// Seed des utilisateurs avec mots de passe hashés
db.users.push({
  id: 1,
  username: 'admin',
  password: bcrypt.hashSync('admin123', SALT_ROUNDS),
  email: 'admin@ecommerce.com',
  role: 'admin'
});

db.users.push({
  id: 2,
  username: 'user',
  password: bcrypt.hashSync('user123', SALT_ROUNDS),
  email: 'user@example.com',
  role: 'customer'
});

// Produits de démo
db.products = [
  { id: 1, name: 'Laptop HP', price: 799, stock: 10, category: 'electronics' },
  { id: 2, name: 'iPhone 14', price: 999, stock: 15, category: 'electronics' },
  { id: 3, name: 'T-Shirt Nike', price: 29, stock: 50, category: 'clothing' },
  { id: 4, name: 'Chaussures Adidas', price: 89, stock: 30, category: 'clothing' }
];

// CORS (restreint au frontend)
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true
  })
);

// Parsing JSON avec taille limitée
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    // Nom de cookie custom (évite le nom par défaut)
    name: 'ecom_session',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
  // nosemgrep: javascript.express.security.audit.express-cookie-settings.express-cookie-session-no-secure
  // En prod : cookie uniquement via HTTPS
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 jours
  expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  path: '/',
  domain: process.env.COOKIE_DOMAIN || 'localhost'
}

  })
);


// Fonction utilitaire pour ne pas renvoyer les champs sensibles
function sanitizeUser(user) {
  if (!user) return null;
  const { password, apiKey, creditCard, ...safe } = user;
  return safe;
}

// Middleware d’authentification JWT
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Non authentifié' });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) {
      return res.status(403).json({ message: 'Token invalide' });
    }
    req.user = payload;
    next();
  });
}

// Middleware d’autorisation admin
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Accès réservé à l’admin' });
  }
  next();
}

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Recherche de produits SANS eval()
app.get('/api/products/search', (req, res) => {
  const query = (req.query.q || '').toLowerCase().trim();

  const results = db.products.filter((p) =>
    p.name.toLowerCase().includes(query)
  );

  res.json(results);
});

// Enregistrement utilisateur (avec hashage)
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      return res
        .status(400)
        .json({ message: 'username, password et email sont obligatoires' });
    }

    const existing = db.users.find(
      (u) => u.username === username || u.email === email
    );
    if (existing) {
      return res
        .status(409)
        .json({ message: 'Utilisateur ou email déjà existant' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const newUser = {
      id: db.users.length + 1,
      username,
      password: hashedPassword,
      email,
      role: 'customer'
    };

    db.users.push(newUser);

    res.status(201).json({
      success: true,
      message: 'Utilisateur créé',
      user: sanitizeUser(newUser)
    });
  } catch (error) {
    console.error('Erreur /api/register :', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Login sécurisé (sans bypass, avec bcrypt)
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: 'username et password sont obligatoires' });
    }

    const user = db.users.find((u) => u.username === username);

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: 'Identifiants incorrects' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res
        .status(401)
        .json({ success: false, message: 'Identifiants incorrects' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    req.session.user = sanitizeUser(user);

    res.json({
      success: true,
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    console.error('Erreur /api/login :', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer le profil de l’utilisateur courant
app.get('/api/users/me', authenticateJWT, (req, res) => {
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'Utilisateur introuvable' });
  }
  res.json(sanitizeUser(user));
});

// Liste de tous les utilisateurs (admin uniquement)
app.get('/api/users', authenticateJWT, requireAdmin, (req, res) => {
  res.json(db.users.map(sanitizeUser));
});

// Détail d’un utilisateur par ID (admin uniquement)
app.get('/api/users/:id', authenticateJWT, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id, 10);

  const user = db.users.find((u) => u.id === userId);

  if (user) {
    res.json(sanitizeUser(user));
  } else {
    res.status(404).json({ message: 'Utilisateur non trouvé' });
  }
});

// Ajouter un avis produit (auth requis)
app.post('/api/products/:id/review', authenticateJWT, (req, res) => {
  const productId = parseInt(req.params.id, 10);
  const { rating, comment } = req.body;

  const product = db.products.find((p) => p.id === productId);
  if (!product) {
    return res.status(404).json({ message: 'Produit non trouvé' });
  }

  const numericRating = Number(rating);
  if (!numericRating || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ message: 'Note invalide (1 à 5)' });
  }

  const review = {
    id: Date.now(),
    productId,
    rating: numericRating,
    comment: comment || '',
    authorId: req.user.id,
    date: new Date()
  };

  db.reviews.push(review);

  res.json({
    success: true,
    review
  });
});

// Récupérer les avis d’un produit
app.get('/api/products/:id/reviews', (req, res) => {
  const productId = parseInt(req.params.id, 10);
  const productReviews = db.reviews.filter((r) => r.productId === productId);
  res.json(productReviews);
});

// Liste des produits (publique)
app.get('/api/products', (req, res) => {
  res.json(db.products);
});

// Checkout (auth obligatoire, pas de stockage de carte en clair)
app.post('/api/checkout', authenticateJWT, (req, res) => {
  const { productId, quantity } = req.body;

  const product = db.products.find((p) => p.id == productId);
  const qty = Number(quantity) || 0;

  if (!product) {
    return res.status(404).json({ message: 'Produit non trouvé' });
  }

  if (qty <= 0) {
    return res.status(400).json({ message: 'Quantité invalide' });
  }

  if (product.stock < qty) {
    return res.status(400).json({ message: 'Stock insuffisant' });
  }

  product.stock -= qty;

  const order = {
    id: db.orders.length + 1,
    userId: req.user.id,
    productId,
    quantity: qty,
    total: product.price * qty,
    date: new Date()
    // Aucune carte bancaire stockée
  };

  db.orders.push(order);

  res.json({
    success: true,
    order
  });
});

// Stats admin (protégées)
app.get('/api/admin/stats', authenticateJWT, requireAdmin, (req, res) => {
  res.json({
    totalUsers: db.users.length,
    totalProducts: db.products.length,
    totalOrders: db.orders.length,
    users: db.users.map(sanitizeUser),
    orders: db.orders
  });
});

// Lecture de fichiers avec protection contre le path traversal (admin only)
app.get('/api/files/:filename', authenticateJWT, requireAdmin, (req, res) => {
  const uploadsDir = path.resolve(__dirname, 'uploads');
const safeName = path.basename(req.params.filename);

// nosemgrep: javascript.express.security.audit.express-path-join-resolve-traversal.express-path-join-resolve-traversal
const filePath = path.resolve(uploadsDir, safeName);

if (!filePath.startsWith(uploadsDir)) {
  return res.status(400).json({ message: 'Chemin de fichier invalide' });
}

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Fichier non trouvé' });
  }

  fs.readFile(filePath, 'utf8', (err, content) => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lecture fichier' });
    }
    res.send(content);
  });
});


// Suppression de /api/debug (ne doit pas exister en prod)

//  Endpoint racine
app.get('/', (req, res) => {
  res.json({
    message: 'E-Commerce API (version sécurisée)',
    endpoints: [
      'GET /health',
      'GET /api/products',
      'GET /api/products/search?q=query',
      'POST /api/register',
      'POST /api/login',
      'GET /api/users/me',
      'GET /api/users (admin)',
      'GET /api/users/:id (admin)',
      'POST /api/products/:id/review (auth)',
      'GET /api/products/:id/reviews',
      'POST /api/checkout (auth)',
      'GET /api/admin/stats (admin)',
      'GET /api/files/:filename (admin)'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
