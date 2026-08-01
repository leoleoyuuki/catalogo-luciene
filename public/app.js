// Estado do Catálogo Público
let publicProducts = [];
let deferredPrompt = null;
let imageObserver = null;

// Elementos DOM
const searchInput = document.getElementById('search-input');
const catalogGrid = document.getElementById('catalog-grid');
const emptyState = document.getElementById('empty-state');
const publicPagination = document.getElementById('public-pagination');
const pwaInstallBtn = document.getElementById('pwa-install-btn');
const connectionStatus = document.getElementById('connection-status');

document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  setupImageObserver();
  fetchPublicCatalog();
  setupPWA();
  setupNetworkMonitoring();
  
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderPublicCatalog();
    });
  }
});

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Otimizar URL de Imagem (Usar versão média .md.jpg de ~100KB)
function getOptimizedImageUrl(url) {
  if (!url) return '';
  if (url.includes('iili.io/') && !url.includes('.md.') && !url.includes('.th.')) {
    return url.replace(/\.(jpg|jpeg|png|webp)$/i, '.md.jpg');
  }
  return url;
}

// Observer para carregamento sob demanda conforme scroll (Lazy Loading ultrarrápido)
function setupImageObserver() {
  if ('IntersectionObserver' in window) {
    imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          const dataSrc = img.getAttribute('data-src');
          if (dataSrc) {
            img.src = dataSrc;
            img.onload = () => img.classList.add('loaded');
          }
          observer.unobserve(img);
        }
      });
    }, { rootMargin: '150px 0px' });
  }
}

// Buscar apenas produtos em estoque da API pública
async function fetchPublicCatalog() {
  try {
    const response = await fetch('/api/products/public?all=true');
    if (!response.ok) throw new Error('Não foi possível carregar o catálogo.');
    
    const data = await response.json();
    publicProducts = Array.isArray(data) ? data : (data.products || []);
    renderPublicCatalog();
  } catch (err) {
    console.error(err);
    catalogGrid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" style="color: var(--danger); background: var(--danger-bg);"><i data-lucide="alert-triangle"></i></div>
        <h3>Erro de Conexão</h3>
        <p>Não foi possível carregar o catálogo no momento. Tente novamente mais tarde.</p>
      </div>
    `;
    initIcons();
  }
}

// Renderizar TODOS os Produtos na Mesma Tela com Lazy Loading
function renderPublicCatalog() {
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const filtered = publicProducts.filter(p => p.name.toLowerCase().includes(searchTerm));

  if (publicPagination) publicPagination.style.display = 'none';

  if (filtered.length === 0) {
    catalogGrid.style.display = 'none';
    emptyState.style.display = 'flex';
    if (searchTerm !== '') {
      emptyState.querySelector('h3').textContent = 'Nenhum produto encontrado';
      emptyState.querySelector('p').textContent = 'Tente buscar por outros termos.';
    } else {
      emptyState.querySelector('h3').textContent = 'Nenhum produto disponível';
      emptyState.querySelector('p').textContent = 'Todos os nossos produtos foram reservados ou vendidos!';
    }
    return;
  }

  emptyState.style.display = 'none';
  catalogGrid.style.display = 'grid';
  catalogGrid.innerHTML = '';

  filtered.forEach(product => {
    const card = document.createElement('div');
    card.className = 'product-card public-product-card';

    const rawImg = product.imageUrl || product.image;
    const optimizedImg = getOptimizedImageUrl(rawImg);

    card.innerHTML = `
      <div class="product-image-container image-skeleton">
        <span class="product-availability-badge"><i data-lucide="check-circle-2" style="width: 12px; height: 12px;"></i> Em Estoque</span>
        <img class="lazy-img" data-src="${optimizedImg}" alt="${product.name}" onerror="if (this.src !== '${rawImg}') this.src='${rawImg}';">
      </div>
      <div class="product-details">
        <h3 class="product-title" title="${product.name}">${product.name}</h3>
        <div class="product-price-public">
          <span class="price-label-public">Preço</span>
          <span class="price-val-public">${formatCurrency(product.price)}</span>
        </div>
        <a href="https://wa.me/?text=Olá!%20Gostaria%20de%20comprar%20o%20produto:%20${encodeURIComponent(product.name)}" target="_blank" class="btn btn-primary btn-block public-book-btn">
          <i data-lucide="shopping-cart"></i>
          <span>Tenho Interesse / Comprar</span>
        </a>
      </div>
    `;

    const imgEl = card.querySelector('.lazy-img');
    if (imageObserver) {
      imageObserver.observe(imgEl);
    } else {
      imgEl.src = optimizedImg;
      imgEl.classList.add('loaded');
    }

    catalogGrid.appendChild(card);
  });

  initIcons();
}

function formatCurrency(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function setupPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW instalado:', reg.scope))
        .catch(err => console.error('Erro SW:', err));
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (pwaInstallBtn) pwaInstallBtn.style.display = 'inline-flex';
  });

  if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`Resposta PWA: ${outcome}`);
      deferredPrompt = null;
      pwaInstallBtn.style.display = 'none';
    });
  }
}

function setupNetworkMonitoring() {
  if (!connectionStatus) return;
  window.addEventListener('online', () => {
    connectionStatus.className = 'status-badge online';
    connectionStatus.querySelector('.status-text').textContent = 'Online';
    fetchPublicCatalog();
  });
  window.addEventListener('offline', () => {
    connectionStatus.className = 'status-badge offline';
    connectionStatus.querySelector('.status-text').textContent = 'Modo Local';
  });
}
