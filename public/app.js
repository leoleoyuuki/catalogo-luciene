// Estado do Catálogo Público
let publicProducts = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
let deferredPrompt = null;

// Elementos DOM
const searchInput = document.getElementById('search-input');
const catalogGrid = document.getElementById('catalog-grid');
const emptyState = document.getElementById('empty-state');
const publicPagination = document.getElementById('public-pagination');
const pwaInstallBtn = document.getElementById('pwa-install-btn');
const connectionStatus = document.getElementById('connection-status');

document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  fetchPublicCatalog();
  setupPWA();
  setupNetworkMonitoring();
  
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      currentPage = 1;
      renderPublicCatalog();
    });
  }
});

function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Buscar apenas produtos em estoque da API pública
async function fetchPublicCatalog() {
  try {
    const response = await fetch('/api/products/public?all=true');
    if (!response.ok) throw new Error('Não foi possível carregar o catálogo.');
    
    publicProducts = await response.json();
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

// Renderizar o Catálogo Público Paginado (10 em 10)
function renderPublicCatalog() {
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const filtered = publicProducts.filter(p => p.name.toLowerCase().includes(searchTerm));

  if (filtered.length === 0) {
    catalogGrid.style.display = 'none';
    emptyState.style.display = 'flex';
    if (publicPagination) publicPagination.innerHTML = '';
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

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  if (currentPage > totalPages) currentPage = totalPages;

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageItems = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  pageItems.forEach(product => {
    const card = document.createElement('div');
    card.className = 'product-card public-product-card';

    const displayImg = product.imageUrl || product.image;

    card.innerHTML = `
      <div class="product-image-container">
        <span class="product-availability-badge"><i data-lucide="check-circle-2" style="width: 12px; height: 12px;"></i> Em Estoque</span>
        <img src="${displayImg}" alt="${product.name}" loading="lazy" onerror="this.src='${product.image}'">
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

    catalogGrid.appendChild(card);
  });

  renderPaginationControls(publicPagination, currentPage, totalPages, (newPage) => {
    currentPage = newPage;
    renderPublicCatalog();
    catalogGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  initIcons();
}

function renderPaginationControls(container, page, totalPages, onPageChange) {
  if (!container || totalPages <= 1) {
    if (container) container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="pagination-wrapper">
      <button class="btn btn-secondary pagination-btn prev-btn" ${page === 1 ? 'disabled' : ''}>
        <i data-lucide="chevron-left"></i> Anterior
      </button>
      <span class="pagination-info">Página <strong>${page}</strong> de <strong>${totalPages}</strong></span>
      <button class="btn btn-secondary pagination-btn next-btn" ${page === totalPages ? 'disabled' : ''}>
        Próxima <i data-lucide="chevron-right"></i>
      </button>
    </div>
  `;

  container.querySelector('.prev-btn').addEventListener('click', () => {
    if (page > 1) onPageChange(page - 1);
  });

  container.querySelector('.next-btn').addEventListener('click', () => {
    if (page < totalPages) onPageChange(page + 1);
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
