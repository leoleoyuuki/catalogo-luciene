const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const FREEIMAGE_API_KEY = '6d207e02198a847aa98d0a2a901485a5';
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Armazenamento em memória global para persistência em ambiente serverless
let globalProductsCache = null;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
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
      console.log('Upload FreeImage.host OK:', data.image.url);
      return data.image.url;
    } else {
      console.warn('Aviso FreeImage.host:', data);
      return null;
    }
  } catch (err) {
    console.error('Erro upload FreeImage.host:', err);
    return null;
  }
}

// Obter lista de produtos (Carrega do disco local se disponível ou do cache)
async function getProducts() {
  if (globalProductsCache !== null) {
    return globalProductsCache;
  }

  const products = [];
  try {
    const items = await fs.readdir(UPLOADS_DIR);
    for (const item of items) {
      const itemPath = path.join(UPLOADS_DIR, item);
      try {
        const stat = await fs.stat(itemPath);
        if (stat.isDirectory()) {
          const metadataPath = path.join(itemPath, 'metadata.json');
          const dataStr = await fs.readFile(metadataPath, 'utf8');
          const product = JSON.parse(dataStr);
          if (!product.status) product.status = 'in_stock';
          products.push(product);
        }
      } catch (e) {
        // Ignora erros de leitura de pastas individuais
      }
    }
  } catch (e) {
    // Pasta uploads não existe no Vercel
  }

  // Se não houver produtos no disco, carrega os 71 produtos do seed-products.json
  if (products.length === 0) {
    try {
      const seedPath = path.join(__dirname, '..', 'seed-products.json');
      const seedStr = await fs.readFile(seedPath, 'utf8');
      const seedProducts = JSON.parse(seedStr);
      products.push(...seedProducts);
    } catch (e) {
      // Nenhum seed encontrado
    }
  }

  products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  globalProductsCache = products;
  return globalProductsCache;
}

// 1. Cadastrar Produto Físico
app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { name, cost, price } = req.body;
    const file = req.file;

    if (!name || !cost || !price) {
      return res.status(400).json({ error: 'Campos nome, custo e valor são obrigatórios.' });
    }

    if (!file) {
      return res.status(400).json({ error: 'A imagem do produto físico é obrigatória.' });
    }

    const numericCost = parseFloat(cost);
    const numericPrice = parseFloat(price);

    if (isNaN(numericCost) || isNaN(numericPrice)) {
      return res.status(400).json({ error: 'Custo e Valor devem ser números válidos.' });
    }

    const timestamp = Date.now();
    const slug = slugify(name) || 'produto';
    const folderId = `${slug}-${timestamp}`;

    // Upload remoto para FreeImage.host
    const remoteImageUrl = await uploadToFreeImageHost(file.buffer, file.originalname, file.mimetype);
    const fallbackImage = `/uploads/${folderId}/image.jpg`;

    const metadata = {
      id: folderId,
      name: name.trim(),
      cost: numericCost,
      price: numericPrice,
      image: remoteImageUrl || fallbackImage,
      imageUrl: remoteImageUrl || fallbackImage,
      status: 'in_stock',
      createdAt: new Date().toISOString()
    };

    // Tentar salvar no disco local se ambiente permitir
    try {
      const productFolder = path.join(UPLOADS_DIR, folderId);
      await fs.mkdir(productFolder, { recursive: true });
      const ext = path.extname(file.originalname) || '.jpg';
      const imageFilename = `image${ext}`;
      await fs.writeFile(path.join(productFolder, imageFilename), file.buffer);
      await fs.writeFile(path.join(productFolder, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');
    } catch (e) {
      // Ignora falhas de disco no Vercel
    }

    // Atualizar cache em memória
    const current = await getProducts();
    current.unshift(metadata);
    globalProductsCache = current;

    console.log(`Produto cadastrado: ${metadata.name}`);
    return res.status(201).json(metadata);
  } catch (err) {
    console.error('Erro ao cadastrar produto:', err);
    return res.status(500).json({ error: 'Erro ao salvar produto.' });
  }
});

// 2. Listar Produtos (Admin)
app.get('/api/products', async (req, res) => {
  try {
    const allProducts = await getProducts();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = (req.query.search || '').toLowerCase().trim();
    const isAll = req.query.all === 'true';

    const filtered = search ? allProducts.filter(p => p.name.toLowerCase().includes(search)) : allProducts;

    if (isAll) {
      return res.json(filtered);
    }

    const startIndex = (page - 1) * limit;
    const pagedProducts = filtered.slice(startIndex, startIndex + limit);

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
    return res.status(500).json({ error: 'Erro ao obter produtos.' });
  }
});

// 3. Listar Produtos Públicos (Somente em estoque, sem custo)
app.get('/api/products/public', async (req, res) => {
  try {
    const allProducts = await getProducts();
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
        image: p.imageUrl || p.image,
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
    console.error('Erro ao listar catálogo público:', err);
    return res.status(500).json({ error: 'Erro ao carregar catálogo público.' });
  }
});

// 4. Dar Baixa no Estoque (Vender Produto)
app.post('/api/products/:id/sell', async (req, res) => {
  try {
    const { id } = req.params;
    const { soldPrice } = req.body;

    const allProducts = await getProducts();
    const product = allProducts.find(p => p.id === id);

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    const numericSoldPrice = parseFloat(soldPrice);
    const finalPrice = !isNaN(numericSoldPrice) && numericSoldPrice >= 0 ? numericSoldPrice : product.price;

    product.status = 'sold';
    product.soldPrice = finalPrice;
    product.soldAt = new Date().toISOString();

    // Tentar atualizar disco local
    try {
      const safeId = path.basename(id);
      const metadataPath = path.join(UPLOADS_DIR, safeId, 'metadata.json');
      await fs.writeFile(metadataPath, JSON.stringify(product, null, 2), 'utf8');
    } catch (e) {
      // Ignora erros de escrita no Vercel
    }

    console.log(`Baixa efetuada: "${product.name}" por R$ ${finalPrice}`);
    return res.json(product);
  } catch (err) {
    console.error('Erro ao dar baixa em produto:', err);
    return res.status(500).json({ error: 'Erro ao efetuar baixa.' });
  }
});

// 5. Deletar Produto
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let allProducts = await getProducts();

    const index = allProducts.findIndex(p => p.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    allProducts.splice(index, 1);
    globalProductsCache = allProducts;

    // Tentar deletar pasta do disco local
    try {
      const safeId = path.basename(id);
      const productFolder = path.join(UPLOADS_DIR, safeId);
      await fs.rm(productFolder, { recursive: true, force: true });
    } catch (e) {
      // Ignora erros no Vercel
    }

    console.log(`Produto deletado: ${id}`);
    return res.json({ success: true, message: 'Produto removido com sucesso.' });
  } catch (err) {
    console.error('Erro ao deletar produto:', err);
    return res.status(500).json({ error: 'Erro ao deletar produto.' });
  }
});

module.exports = app;
