const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3005;

// Chave da API do FreeImage.host
const FREEIMAGE_API_KEY = '6d207e02198a847aa98d0a2a901485a5';

// Configuração de diretórios
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Cache em memória para performance ultrarrápida (0ms I/O)
let productsCache = null;

// Garantir que as pastas locais existem
async function initDirs() {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.mkdir(PUBLIC_DIR, { recursive: true });
  } catch (err) {
    console.error('Erro ao inicializar pastas:', err);
  }
}
initDirs();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// Armazenamento em memória com multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

async function uploadToFreeImageHost(buffer, filename, mimetype) {
  try {
    const formData = new FormData();
    formData.append('key', FREEIMAGE_API_KEY);
    formData.append('action', 'upload');
    formData.append('format', 'json');

    const blob = new Blob([buffer], { type: mimetype || 'image/jpeg' });
    formData.append('source', blob, filename || 'image.jpg');

    const response = await fetch('https://freeimage.host/api/1/upload', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    if (data && data.status_code === 200 && data.image && data.image.url) {
      console.log('Imagem enviada com sucesso para FreeImage.host:', data.image.url);
      return data.image.url;
    } else {
      console.warn('Aviso do FreeImage.host:', data);
      return null;
    }
  } catch (err) {
    console.error('Falha ao enviar imagem para FreeImage.host:', err);
    return null;
  }
}

// Obter produtos com Cache em memória
async function getCachedProducts(forceRefresh = false) {
  if (productsCache !== null && !forceRefresh) {
    return productsCache;
  }

  const items = await fs.readdir(UPLOADS_DIR);
  const products = [];

  for (const item of items) {
    const itemPath = path.join(UPLOADS_DIR, item);
    const stat = await fs.stat(itemPath);

    if (stat.isDirectory()) {
      const metadataPath = path.join(itemPath, 'metadata.json');
      try {
        await fs.access(metadataPath);
        const dataStr = await fs.readFile(metadataPath, 'utf8');
        const product = JSON.parse(dataStr);
        if (!product.status) {
          product.status = 'in_stock';
        }
        products.push(product);
      } catch (e) {
        // Ignora pastas sem metadata.json
      }
    }
  }

  // Ordenar por data decrescente
  products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  productsCache = products;
  return productsCache;
}

// Invalida a cache em memória
function invalidateCache() {
  productsCache = null;
}

// 1. Cadastrar Produto (Webhook / API)
app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { name, cost, price } = req.body;
    const file = req.file;

    if (!name || !cost || !price) {
      return res.status(400).json({ error: 'Campos nome, custo e valor são obrigatórios.' });
    }

    if (!file) {
      return res.status(400).json({ error: 'A imagem do procedimento é obrigatória.' });
    }

    const numericCost = parseFloat(cost);
    const numericPrice = parseFloat(price);

    if (isNaN(numericCost) || isNaN(numericPrice)) {
      return res.status(400).json({ error: 'Custo e Valor devem ser números válidos.' });
    }

    const timestamp = Date.now();
    const slug = slugify(name) || 'procedimento';
    const folderId = `${slug}-${timestamp}`;
    const productFolder = path.join(UPLOADS_DIR, folderId);

    await fs.mkdir(productFolder, { recursive: true });

    const ext = path.extname(file.originalname) || '.jpg';
    const imageFilename = `image${ext}`;
    const localImagePath = path.join(productFolder, imageFilename);
    await fs.writeFile(localImagePath, file.buffer);

    const localImageUri = `/uploads/${folderId}/${imageFilename}`;
    const remoteImageUrl = await uploadToFreeImageHost(file.buffer, file.originalname, file.mimetype);

    const metadata = {
      id: folderId,
      name: name.trim(),
      cost: numericCost,
      price: numericPrice,
      image: localImageUri,
      imageUrl: remoteImageUrl || localImageUri,
      status: 'in_stock',
      createdAt: new Date().toISOString()
    };

    const metadataPath = path.join(productFolder, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

    // Atualizar cache
    invalidateCache();

    console.log(`Procedimento cadastrado: ${metadata.name} (Pasta: ${folderId})`);
    return res.status(201).json(metadata);

  } catch (err) {
    console.error('Erro ao adicionar produto:', err);
    return res.status(500).json({ error: 'Erro interno ao salvar procedimento no computador.' });
  }
});

// 2. Listar Produtos (Admin - com Paginação de 10 em 10 e Estatísticas Globais)
app.get('/api/products', async (req, res) => {
  try {
    const allProducts = await getCachedProducts();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = (req.query.search || '').toLowerCase().trim();
    const isAll = req.query.all === 'true';

    // Filtrar se houver busca
    const filtered = search ? allProducts.filter(p => p.name.toLowerCase().includes(search)) : allProducts;

    if (isAll) {
      return res.json(filtered);
    }

    const startIndex = (page - 1) * limit;
    const pagedProducts = filtered.slice(startIndex, startIndex + limit);

    // Calcular estatísticas globais
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

    return res.json({
      products: pagedProducts,
      total: filtered.length,
      page,
      limit,
      totalPages: Math.ceil(filtered.length / limit),
      stats: {
        stockCount: stockItems.length,
        stockCostTotal,
        soldCount: soldItems.length,
        totalRevenue,
        netProfit,
        marginPct
      }
    });
  } catch (err) {
    console.error('Erro ao listar produtos:', err);
    return res.status(500).json({ error: 'Erro ao buscar produtos.' });
  }
});

// 3. Listar Produtos Públicos (Somente em estoque, paginados de 10 em 10, SEM CUSTO)
app.get('/api/products/public', async (req, res) => {
  try {
    const allProducts = await getCachedProducts();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = (req.query.search || '').toLowerCase().trim();
    const isAll = req.query.all === 'true';

    const inStockProducts = allProducts
      .filter(p => p.status === 'in_stock')
      .map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        image: p.image,
        imageUrl: p.imageUrl || p.image,
        createdAt: p.createdAt
      }));

    const filtered = search ? inStockProducts.filter(p => p.name.toLowerCase().includes(search)) : inStockProducts;

    if (isAll) {
      return res.json(filtered);
    }

    const startIndex = (page - 1) * limit;
    const pagedProducts = filtered.slice(startIndex, startIndex + limit);

    return res.json({
      products: pagedProducts,
      total: filtered.length,
      page,
      limit,
      totalPages: Math.ceil(filtered.length / limit)
    });
  } catch (err) {
    console.error('Erro ao listar produtos públicos:', err);
    return res.status(500).json({ error: 'Erro ao buscar catálogo público.' });
  }
});

// 4. Abater Estoque / Dar Baixa (Vender Produto)
app.post('/api/products/:id/sell', async (req, res) => {
  try {
    const { id } = req.params;
    const { soldPrice } = req.body;

    const safeId = path.basename(id);
    const productFolder = path.join(UPLOADS_DIR, safeId);
    const metadataPath = path.join(productFolder, 'metadata.json');

    try {
      await fs.access(metadataPath);
    } catch {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    const dataStr = await fs.readFile(metadataPath, 'utf8');
    const product = JSON.parse(dataStr);

    const numericSoldPrice = parseFloat(soldPrice);
    const finalPrice = !isNaN(numericSoldPrice) && numericSoldPrice >= 0 ? numericSoldPrice : product.price;

    product.status = 'sold';
    product.soldPrice = finalPrice;
    product.soldAt = new Date().toISOString();

    await fs.writeFile(metadataPath, JSON.stringify(product, null, 2), 'utf8');

    // Invalida a cache em memória
    invalidateCache();

    console.log(`Baixa efetuada: "${product.name}" por R$ ${finalPrice}`);
    return res.json(product);
  } catch (err) {
    console.error('Erro ao dar baixa em produto:', err);
    return res.status(500).json({ error: 'Erro ao efetuar baixa do estoque.' });
  }
});

// 5. Deletar Produto
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const safeId = path.basename(id);
    const productFolder = path.join(UPLOADS_DIR, safeId);

    try {
      await fs.access(productFolder);
    } catch {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    await fs.rm(productFolder, { recursive: true, force: true });
    
    // Invalida a cache em memória
    invalidateCache();

    console.log(`Produto deletado: ${safeId}`);
    return res.json({ success: true, message: 'Produto e pasta excluídos com sucesso.' });
  } catch (err) {
    console.error('Erro ao deletar produto:', err);
    return res.status(500).json({ error: 'Erro ao deletar produto.' });
  }
});

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  Servidor Lulu Estética (Otimizado + Cache) rodando!`);
  console.log(`  Catálogo Público: http://localhost:${PORT}/index.html`);
  console.log(`  Painel Admin:     http://localhost:${PORT}/admin.html`);
  
  const localIPs = getLocalIPs();
  if (localIPs.length > 0) {
    console.log(`\n  Acesse no seu celular pela rede Wi-Fi local:`);
    localIPs.forEach(ip => {
      console.log(`  👉 Público: http://${ip}:${PORT}/index.html`);
      console.log(`  👉 Admin:   http://${ip}:${PORT}/admin.html`);
    });
  }
  
  console.log(`\n  Para compartilhar na Internet: npm run share`);
  console.log(`======================================================\n`);
});
