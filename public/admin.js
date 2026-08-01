// Estado global da aplicação Admin
let allProducts = [];
let selectedProductForSell = null;
let imageObserver = null;

// Elementos DOM
const dropzone = document.getElementById('dropzone');
const imageInput = document.getElementById('image-input');
const uploadPlaceholder = document.getElementById('upload-placeholder');
const previewContainer = document.getElementById('preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image-btn');
const productForm = document.getElementById('product-form');
const searchInput = document.getElementById('search-input');
const submitBtn = document.getElementById('submit-btn');

// Abas
const tabStockBtn = document.getElementById('tab-stock-btn');
const tabSalesBtn = document.getElementById('tab-sales-btn');
const stockView = document.getElementById('stock-view');
const salesView = document.getElementById('sales-view');
const stockBadge = document.getElementById('stock-badge');
const salesBadge = document.getElementById('sales-badge');

// Grids, Tabelas e Paginação
const stockGrid = document.getElementById('stock-grid');
const stockEmpty = document.getElementById('stock-empty');
const stockPagination = document.getElementById('stock-pagination');
const salesTableBody = document.getElementById('sales-table-body');
const salesEmpty = document.getElementById('sales-empty');
const salesPagination = document.getElementById('sales-pagination');

// Estatísticas Dashboard
const statStockCount = document.getElementById('stat-stock-count');
const statStockValue = document.getElementById('stat-stock-value');
const statSoldCount = document.getElementById('stat-sold-count');
const statRevenue = document.getElementById('stat-revenue');
const statProfit = document.getElementById('stat-profit');
const statMargin = document.getElementById('stat-margin');

// Modal de Baixa
const sellModal = document.getElementById('sell-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelSellBtn = document.getElementById('cancel-sell-btn');
const sellForm = document.getElementById('sell-form');
const soldPriceInput = document.getElementById('sold-price-input');
const modalProductName = document.getElementById('modal-product-name');
const modalProductCost = document.getElementById('modal-product-cost');
const modalProductPrice = document.getElementById('modal-product-price');

document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  setupImageObserver();
  setupImageUpload();
  setupFormValidation();
  setupTabs();
  setupModal();
  fetchProducts();
  setupPWA();
  setupNetworkMonitoring();
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

function setupImageUpload() {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'), false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      imageInput.files = files;
      handleImageSelected(files[0]);
    }
  });

  imageInput.addEventListener('change', () => {
    if (imageInput.files.length > 0) {
      handleImageSelected(imageInput.files[0]);
    }
  });

  removeImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearImageSelection();
  });
}

function handleImageSelected(file) {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onloadend = () => {
    imagePreview.src = reader.result;
    uploadPlaceholder.style.display = 'none';
    previewContainer.style.display = 'flex';
    document.getElementById('image-error').textContent = '';
  };
}

function clearImageSelection() {
  imageInput.value = '';
  imagePreview.src = '#';
  previewContainer.style.display = 'none';
  uploadPlaceholder.style.display = 'flex';
}

function setupTabs() {
  tabStockBtn.addEventListener('click', () => {
    tabStockBtn.classList.add('active');
    tabSalesBtn.classList.remove('active');
    stockView.style.display = 'block';
    salesView.style.display = 'none';
  });

  tabSalesBtn.addEventListener('click', () => {
    tabSalesBtn.classList.add('active');
    tabStockBtn.classList.remove('active');
    stockView.style.display = 'none';
    salesView.style.display = 'block';
  });

  searchInput.addEventListener('input', () => {
    renderViews();
  });
}

function setupFormValidation() {
  ['name-input', 'cost-input', 'price-input'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      const errorId = id.replace('-input', '-error');
      document.getElementById(errorId).textContent = '';
    });
  });

  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    let hasError = false;
    const nameVal = document.getElementById('name-input').value.trim();
    if (!nameVal) {
      document.getElementById('name-error').textContent = 'O nome do produto é obrigatório.';
      hasError = true;
    }

    const costVal = parseFloat(document.getElementById('cost-input').value);
    if (isNaN(costVal) || costVal < 0) {
      document.getElementById('cost-error').textContent = 'Insira um custo válido.';
      hasError = true;
    }

    const priceVal = parseFloat(document.getElementById('price-input').value);
    if (isNaN(priceVal) || priceVal < 0) {
      document.getElementById('price-error').textContent = 'Insira um preço de venda válido.';
      hasError = true;
    }

    if (!imageInput.files || imageInput.files.length === 0) {
      document.getElementById('image-error').textContent = 'Selecione uma imagem.';
      hasError = true;
    }

    if (hasError) return;

    submitBtn.disabled = true;
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<div class="spinner" style="width: 16px; height: 16px; border-width: 2px; margin: 0 8px 0 0; display: inline-block;"></div> Enviando para Nuvem...';

    const formData = new FormData();
    formData.append('name', nameVal);
    formData.append('cost', costVal);
    formData.append('price', priceVal);
    formData.append('image', imageInput.files[0]);

    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha ao salvar produto.');

      showToast('Produto cadastrado no estoque com sucesso!', 'success');
      productForm.reset();
      clearImageSelection();
      fetchProducts();

    } catch (err) {
      showToast(err.message || 'Erro ao conectar ao servidor.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
}

function setupModal() {
  const closeModal = () => {
    sellModal.style.display = 'none';
    selectedProductForSell = null;
    sellForm.reset();
    document.getElementById('sell-price-error').textContent = '';
  };

  closeModalBtn.addEventListener('click', closeModal);
  cancelSellBtn.addEventListener('click', closeModal);

  sellForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedProductForSell) return;

    const soldPrice = parseFloat(soldPriceInput.value);
    if (isNaN(soldPrice) || soldPrice < 0) {
      document.getElementById('sell-price-error').textContent = 'Insira um valor final de venda válido.';
      return;
    }

    const confirmBtn = document.getElementById('confirm-sell-btn');
    confirmBtn.disabled = true;

    try {
      const response = await fetch(`/api/products/${selectedProductForSell.id}/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soldPrice })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha ao dar baixa.');

      showToast(`Baixa efetuada! "${result.name}" marcado como vendido.`, 'success');
      closeModal();
      fetchProducts();
    } catch (err) {
      showToast(err.message || 'Erro ao efetuar baixa.', 'error');
    } finally {
      confirmBtn.disabled = false;
    }
  });
}

function openSellModal(product) {
  selectedProductForSell = product;
  modalProductName.textContent = product.name;
  modalProductCost.textContent = formatCurrency(product.cost);
  modalProductPrice.textContent = formatCurrency(product.price);
  soldPriceInput.value = product.price;
  sellModal.style.display = 'flex';
  initIcons();
}

async function fetchProducts() {
  try {
    const response = await fetch('/api/products?all=true');
    if (!response.ok) throw new Error('Não foi possível buscar o estoque.');

    const data = await response.json();
    allProducts = Array.isArray(data) ? data : (data.products || []);
    calculateStats();
    renderViews();
  } catch (err) {
    console.error(err);
    showToast('Erro ao obter produtos do servidor.', 'error');
  }
}

function calculateStats() {
  const stockItems = allProducts.filter(p => p.status !== 'sold');
  const soldItems = allProducts.filter(p => p.status === 'sold');

  let stockCostTotal = 0;
  stockItems.forEach(p => stockCostTotal += parseFloat(p.cost || 0));

  let totalRevenue = 0;
  let totalSoldCost = 0;

  soldItems.forEach(p => {
    totalRevenue += parseFloat(p.soldPrice || p.price || 0);
    totalSoldCost += parseFloat(p.cost || 0);
  });

  const netProfit = totalRevenue - totalSoldCost;
  const marginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  statStockCount.textContent = stockItems.length;
  statStockValue.textContent = `${formatCurrency(stockCostTotal)} em custos`;
  statSoldCount.textContent = soldItems.length;
  statRevenue.textContent = formatCurrency(totalRevenue);
  statProfit.textContent = formatCurrency(netProfit);
  statMargin.textContent = `${marginPct.toFixed(1)}% margem real`;

  stockBadge.textContent = stockItems.length;
  salesBadge.textContent = soldItems.length;

  if (netProfit >= 0) {
    statProfit.style.color = 'var(--success)';
    statMargin.style.color = 'var(--success)';
    statMargin.style.background = 'var(--success-bg)';
  } else {
    statProfit.style.color = 'var(--danger)';
    statMargin.style.color = 'var(--danger)';
    statMargin.style.background = 'var(--danger-bg)';
  }
}

function renderViews() {
  const searchTerm = searchInput.value.toLowerCase().trim();
  const filtered = allProducts.filter(p => p.name.toLowerCase().includes(searchTerm));
  
  const stockItems = filtered.filter(p => p.status !== 'sold');
  const soldItems = filtered.filter(p => p.status === 'sold');

  renderStockGrid(stockItems);
  renderSalesTable(soldItems);
}

function renderStockGrid(stockItems) {
  if (stockPagination) stockPagination.style.display = 'none';

  if (stockItems.length === 0) {
    stockGrid.style.display = 'none';
    stockEmpty.style.display = 'flex';
    return;
  }

  stockEmpty.style.display = 'none';
  stockGrid.style.display = 'grid';
  stockGrid.innerHTML = '';

  stockItems.forEach(product => {
    const margin = product.price > 0 ? ((product.price - product.cost) / product.price) * 100 : 0;
    const card = document.createElement('div');
    card.className = 'product-card';

    const rawImg = product.imageUrl || product.image;
    const optimizedImg = getOptimizedImageUrl(rawImg);

    card.innerHTML = `
      <div class="product-image-container image-skeleton">
        <span class="product-margin-badge">Margem: ${margin.toFixed(0)}%</span>
        <button class="delete-product-btn" title="Excluir produto" data-id="${product.id}">
          <i data-lucide="trash-2"></i>
        </button>
        <img class="lazy-img" data-src="${optimizedImg}" alt="${product.name}" onerror="if (this.src !== '${rawImg}') this.src='${rawImg}';">
      </div>
      <div class="product-details">
        <h3 class="product-title" title="${product.name}">${product.name}</h3>
        <div class="product-prices">
          <div class="price-item cost">
            <span class="price-label">Custo</span>
            <span class="price-val">${formatCurrency(product.cost)}</span>
          </div>
          <div class="price-item sale">
            <span class="price-label">Preço</span>
            <span class="price-val">${formatCurrency(product.price)}</span>
          </div>
        </div>
        
        <button class="btn btn-primary sell-action-btn btn-block" style="margin-top: 8px;">
          <i data-lucide="check-circle-2"></i>
          <span>Dar Baixa (Vender)</span>
        </button>
      </div>
    `;

    const imgEl = card.querySelector('.lazy-img');
    if (imageObserver) {
      imageObserver.observe(imgEl);
    } else {
      imgEl.src = optimizedImg;
      imgEl.classList.add('loaded');
    }

    card.querySelector('.sell-action-btn').addEventListener('click', () => {
      openSellModal(product);
    });

    card.querySelector('.delete-product-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteProduct(product.id, product.name);
    });

    stockGrid.appendChild(card);
  });

  initIcons();
}

function renderSalesTable(soldItems) {
  if (salesPagination) salesPagination.style.display = 'none';

  if (soldItems.length === 0) {
    salesView.querySelector('.sales-table-card').style.display = 'none';
    salesEmpty.style.display = 'flex';
    return;
  }

  salesEmpty.style.display = 'none';
  salesView.querySelector('.sales-table-card').style.display = 'block';
  salesTableBody.innerHTML = '';

  soldItems.forEach(product => {
    const cost = parseFloat(product.cost || 0);
    const soldPrice = parseFloat(product.soldPrice || product.price || 0);
    const profit = soldPrice - cost;
    
    const soldDate = product.soldAt ? new Date(product.soldAt).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
    }) : '-';

    const rawImg = product.imageUrl || product.image;
    const optimizedImg = getOptimizedImageUrl(rawImg);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="table-product-info">
          <img data-src="${optimizedImg}" class="table-thumb lazy-img" alt="${product.name}" onerror="if (this.src !== '${rawImg}') this.src='${rawImg}';">
          <strong>${product.name}</strong>
        </div>
      </td>
      <td>${formatCurrency(cost)}</td>
      <td>${formatCurrency(product.price)}</td>
      <td><strong style="color: var(--primary);">${formatCurrency(soldPrice)}</strong></td>
      <td><strong style="color: ${profit >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatCurrency(profit)}</strong></td>
      <td><span class="table-date">${soldDate}</span></td>
      <td>
        <button class="delete-sales-btn" title="Excluir registro" data-id="${product.id}">
          <i data-lucide="trash-2"></i>
        </button>
      </td>
    `;

    const imgEl = tr.querySelector('.lazy-img');
    if (imageObserver) {
      imageObserver.observe(imgEl);
    } else {
      imgEl.src = optimizedImg;
    }

    tr.querySelector('.delete-sales-btn').addEventListener('click', () => {
      confirmDeleteProduct(product.id, product.name);
    });

    salesTableBody.appendChild(tr);
  });

  initIcons();
}

async function confirmDeleteProduct(id, name) {
  if (confirm(`Tem certeza que deseja excluir "${name}"?\nEsta ação removerá o produto do seu catálogo.`)) {
    try {
      const response = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha ao deletar.');

      showToast('Produto excluído com sucesso!', 'success');
      fetchProducts();
    } catch (err) {
      showToast(err.message || 'Erro ao excluir.', 'error');
    }
  }
}

function formatCurrency(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const iconName = type === 'success' ? 'check-circle' : 'alert-circle';
  toast.innerHTML = `
    <span class="toast-icon ${type}"><i data-lucide="${iconName}"></i></span>
    <span class="toast-message">${message}</span>
  `;
  container.appendChild(toast);
  initIcons();
  setTimeout(() => toast.classList.add('show'), 50);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function setupPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW ativo:', reg.scope))
        .catch(err => console.error('Erro SW:', err));
    });
  }
}

function setupNetworkMonitoring() {
  const connectionStatus = document.getElementById('connection-status');
  if (!connectionStatus) return;
  window.addEventListener('online', () => {
    connectionStatus.className = 'status-badge online';
    connectionStatus.querySelector('.status-text').textContent = 'Online';
  });
  window.addEventListener('offline', () => {
    connectionStatus.className = 'status-badge offline';
    connectionStatus.querySelector('.status-text').textContent = 'Sem rede';
  });
}
