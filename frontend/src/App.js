import React, { useState, useEffect } from 'react';
import './App.css';

const API_URL = 'http://localhost:5001/api';

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [view, setView] = useState('products');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [reviews, setReviews] = useState([]);

  // Chargement initial : produits + éventuelle session (token en sessionStorage)
  useEffect(() => {
    const storedToken = sessionStorage.getItem('token');
    const storedUser = sessionStorage.getItem('user');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }

    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const response = await fetch(`${API_URL}/products`);
      const data = await response.json();
      setProducts(data);
    } catch (error) {
      console.error('Erreur chargement produits:', error);
    }
  };

  // Recherche sans eval()
  const handleSearch = async () => {
    try {
      const query = searchQuery.trim().toLowerCase();

      if (!query) {
        // Si la recherche est vide ça recharge la liste initiale
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

  const handleLogin = async (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const password = e.target.password.value;

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (data.success) {
        // On garde le token en sessionStorage (moins persistant que localStorage)
        sessionStorage.setItem('token', data.token);
        sessionStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        setView('products');
      } else {
        alert('Identifiants incorrects');
      }
    } catch (error) {
      console.error('Erreur login:', error);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });

      await response.json();
      alert('Inscription réussie ! Vous pouvez maintenant vous connecter.');
      setView('login');
    } catch (error) {
      console.error('Erreur inscription:', error);
    }
  };

  const addToCart = (product) => {
    setCart([...cart, product]);
    alert('Produit ajouté au panier !');
  };

  // Pas de collecte de carte bancaire en clair
  const handleCheckout = async () => {
    if (cart.length === 0) {
      alert('Votre panier est vide');
      return;
    }

    if (!token || !user) {
      alert('Vous devez être connecté pour passer commande.');
      return;
    }

    try {
      for (const product of cart) {
        await fetch(`${API_URL}/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            userId: user.id,
            productId: product.id,
            quantity: 1,
            // Dans une vraie appli : token de paiement retourné par Stripe/PayPal
            paymentToken: 'secure-payment-token'
          })
        });
      }

      alert('Commande validée !');
      setCart([]);
    } catch (error) {
      console.error('Erreur checkout:', error);
      alert('Une erreur est survenue lors du paiement.');
    }
  };

  const ProductCard = ({ product }) => {
    return (
      <div className="product-card">
        {/* on met un affichage texte simple (pas de dangerouslySetInnerHTML) */}
        <h3>{product.name}</h3>
        <p className="price">{product.price}€</p>
        <p>Stock: {product.stock}</p>
        <button onClick={() => addToCart(product)}>Ajouter au panier</button>
        <button onClick={() => viewProductDetails(product)}>
          Voir détails & Avis
        </button>
      </div>
    );
  };

  const loadProductReviews = async (productId) => {
    try {
      const response = await fetch(`${API_URL}/products/${productId}/reviews`);
      const data = await response.json();
      setReviews(data);
    } catch (error) {
      console.error('Erreur chargement reviews:', error);
    }
  };

  const viewProductDetails = (product) => {
    setSelectedProduct(product);
    loadProductReviews(product.id);
    setView('product-details');
  };

  const handleAddReview = async (productId) => {
    const ratingStr = prompt('Note (1-5):');
    const comment = prompt('Votre avis:');

    if (!ratingStr || !comment) return;

    const rating = parseInt(ratingStr, 10);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      alert('La note doit être un nombre entre 1 et 5.');
      return;
    }

    try {
      await fetch(`${API_URL}/products/${productId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          comment
        })
      });

      alert('Avis ajouté !');
      loadProductReviews(productId);
    } catch (error) {
      console.error('Erreur ajout avis:', error);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    sessionStorage.clear();
    setView('products');
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🛒 E-Commerce</h1>
        <nav>
          <button onClick={() => setView('products')}>Produits</button>
          {user ? (
            <>
              <button onClick={() => setView('cart')}>
                Panier ({cart.length})
              </button>
              <button onClick={() => setView('profile')}>
                Profil ({user.username})
              </button>
              <button onClick={handleLogout}>Déconnexion</button>
            </>
          ) : (
            <>
              <button onClick={() => setView('login')}>Connexion</button>
              <button onClick={() => setView('register')}>Inscription</button>
            </>
          )}
        </nav>
      </header>

      <main>
        {view === 'products' && (
          <div className="products-view">
            <h2>Nos Produits</h2>

            <div className="search-bar">
              <input
                type="text"
                placeholder="Rechercher un produit..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button onClick={handleSearch}>Rechercher</button>
              <button onClick={loadProducts}>Réinitialiser</button>
            </div>

            <div className="products-grid">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        )}

        {view === 'login' && (
          <div className="form-container">
            <h2>Connexion</h2>
            <form onSubmit={handleLogin}>
              <input name="username" placeholder="Nom d'utilisateur" required />
              <input
                name="password"
                type="password"
                placeholder="Mot de passe"
                required
              />
              <button type="submit">Se connecter</button>
            </form>
            <p>
              Pas de compte ?{' '}
              <button onClick={() => setView('register')}>S'inscrire</button>
            </p>
            <p style={{ fontSize: '0.8em', color: '#666' }}>
              Test: admin / admin123
            </p>
          </div>
        )}

        {view === 'register' && (
          <div className="form-container">
            <h2>Inscription</h2>
            <form onSubmit={handleRegister}>
              <input name="username" placeholder="Nom d'utilisateur" required />
              <input name="email" type="email" placeholder="Email" required />
              <input
                name="password"
                type="password"
                placeholder="Mot de passe"
                required
              />
              <button type="submit">S'inscrire</button>
            </form>
          </div>
        )}

        {view === 'cart' && (
          <div className="cart-view">
            <h2>Mon Panier</h2>
            {cart.length === 0 ? (
              <p>Votre panier est vide</p>
            ) : (
              <>
                <ul>
                  {cart.map((item, index) => (
                    <li key={index}>
                      {item.name} - {item.price}€
                    </li>
                  ))}
                </ul>
                <p>
                  Total:{' '}
                  {cart.reduce((sum, item) => sum + item.price, 0)}
                  €
                </p>
                <button onClick={handleCheckout}>Payer</button>
              </>
            )}
          </div>
        )}

        {view === 'profile' && user && (
          <div className="profile-view">
            <h2>Mon Profil</h2>
            <pre
              style={{
                textAlign: 'left',
                background: '#f5f5f5',
                padding: '20px'
              }}
            >
              {JSON.stringify(user, null, 2)}
            </pre>
            {/* On a supprimé le champ "userId" + fetch /users/:id qui créait une IDOR */}
          </div>
        )}

        {view === 'product-details' && selectedProduct && (
          <div className="product-details-view">
            <button
              onClick={() => setView('products')}
              style={{ marginBottom: '20px' }}
            >
              ← Retour aux produits
            </button>

            <div className="product-details-card">
              {/* Affichage texte simple */}
              <h2>{selectedProduct.name}</h2>
              <p
                className="price"
                style={{
                  fontSize: '2em',
                  color: '#007bff',
                  margin: '20px 0'
                }}
              >
                {selectedProduct.price}€
              </p>
              <p>
                <strong>Catégorie:</strong> {selectedProduct.category}
              </p>
              <p>
                <strong>Stock disponible:</strong> {selectedProduct.stock}
              </p>
              <button
                onClick={() => addToCart(selectedProduct)}
                style={{ marginTop: '20px', padding: '15px 30px', fontSize: '18px' }}
              >
                Ajouter au panier
              </button>
            </div>

            <div className="reviews-section" style={{ marginTop: '40px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <h3>Avis clients ({reviews.length})</h3>
                <button onClick={() => handleAddReview(selectedProduct.id)}>
                  ✍️ Laisser un avis
                </button>
              </div>

              {reviews.length === 0 ? (
                <p
                  style={{
                    textAlign: 'center',
                    color: '#666',
                    marginTop: '30px'
                  }}
                >
                  Aucun avis pour le moment. Soyez le premier à donner votre avis !
                </p>
              ) : (
                <div className="reviews-list">
                  {reviews.map((review) => (
                    <div key={review.id} className="review-card">
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '10px'
                        }}
                      >
                        <div className="rating">
                          {'⭐'.repeat(review.rating)}
                          <span
                            style={{ color: '#999', marginLeft: '10px' }}
                          >
                            {review.rating}/5
                          </span>
                        </div>
                        <span
                          style={{ color: '#999', fontSize: '0.9em' }}
                        >
                          {new Date(review.date).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                      {/* Affichage du commentaire sans HTML interprété */}
                      <div className="review-comment">{review.comment}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer>
        <p>E-Commerce Application</p>
        <p>Projet DevSecOps</p>
      </footer>
    </div>
  );
}

export default App;
