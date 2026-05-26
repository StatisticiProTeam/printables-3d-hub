import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { exec, spawn } from 'child_process';
import multer from 'multer';
import axios from 'axios';
import * as cheerio from 'cheerio';

const app = express();
const PORT = process.env.PORT || 5000;
const DB_PATH = path.join(process.cwd(), 'db.json');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Ensure uploads folder exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// Helper: Read Database
function readDb() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(data);
    if (!parsed.orders) parsed.orders = [];
    return parsed;
  } catch (error) {
    console.error('Error reading DB:', error);
    return { settings: {}, materials: [], models: [], orders: [] };
  }
}

// Helper: Write Database
function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing DB:', error);
  }
}

// Helper: Detect Ultimaker Cura Executable on Windows
function detectCuraPath() {
  try {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    if (!fs.existsSync(programFiles)) return null;

    const dirs = fs.readdirSync(programFiles);
    // Find directories starting with "UltiMaker Cura" or "Ultimaker Cura"
    const curaDirs = dirs.filter(d => d.toLowerCase().startsWith('ultimaker cura'));
    
    // Sort directories descending so the latest version comes first (e.g. 5.8.0 > 5.7.0)
    curaDirs.sort((a, b) => b.localeCompare(a));

    for (const dir of curaDirs) {
      const fullDir = path.join(programFiles, dir);
      // Check both older "Cura.exe" and newer "UltiMaker-Cura.exe" / "Ultimaker-Cura.exe" filenames
      const potentialExes = ['UltiMaker-Cura.exe', 'Ultimaker-Cura.exe', 'Cura.exe'];
      for (const exeName of potentialExes) {
        const exePath = path.join(fullDir, exeName);
        if (fs.existsSync(exePath)) {
          console.log(`[Cura Detector] Found Ultimaker Cura at: ${exePath}`);
          return exePath;
        }
      }
    }
  } catch (error) {
    console.error('[Cura Detector] Error detecting Cura path:', error);
  }
  return null;
}

// Helper: Calculate Volume & Weight of STL file
function calculateStlVolumeAndWeight(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { weightGrams: 20, printTimeMinutes: 90 };
    }
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 84) {
      return { weightGrams: 20, printTimeMinutes: 90 };
    }

    let isBinary = false;
    // Check if binary by file size formula
    const numFaces = buffer.readUInt32LE(80);
    const expectedSize = 80 + 4 + numFaces * 50;
    if (buffer.length === expectedSize) {
      isBinary = true;
    } else {
      // Fallback check: check if it doesn't start with "solid"
      const headerStr = buffer.toString('utf8', 0, 80);
      if (!headerStr.trim().startsWith('solid')) {
        isBinary = true;
      }
    }

    let totalVolume = 0; // in mm^3

    if (isBinary) {
      const numFaces = buffer.readUInt32LE(80);
      let offset = 84;
      for (let i = 0; i < numFaces; i++) {
        if (offset + 50 > buffer.length) break;
        // Read vertex 1 (3 floats = 12 bytes, offset starts at normal = 12 bytes)
        const v1x = buffer.readFloatLE(offset + 12);
        const v1y = buffer.readFloatLE(offset + 16);
        const v1z = buffer.readFloatLE(offset + 20);
        // Read vertex 2
        const v2x = buffer.readFloatLE(offset + 24);
        const v2y = buffer.readFloatLE(offset + 28);
        const v2z = buffer.readFloatLE(offset + 32);
        // Read vertex 3
        const v3x = buffer.readFloatLE(offset + 36);
        const v3y = buffer.readFloatLE(offset + 40);
        const v3z = buffer.readFloatLE(offset + 44);

        // Signed volume of tetrahedron from origin
        const vol = (v1x * v2y * v3z - v1x * v2z * v3y - v1y * v2x * v3z + v1y * v2z * v3x + v1z * v2x * v3y - v1z * v2y * v3x) / 6.0;
        totalVolume += vol;

        offset += 50;
      }
    } else {
      // ASCII STL parsing
      const content = buffer.toString('utf8');
      const vertexRegex = /vertex\s+([-\d\.e+]+)\s+([-\d\.e+]+)\s+([-\d\.e+]+)/gi;
      let vertices = [];
      let match;
      while ((match = vertexRegex.exec(content)) !== null) {
        vertices.push({
          x: parseFloat(match[1]),
          y: parseFloat(match[2]),
          z: parseFloat(match[3])
        });
      }
      
      for (let i = 0; i < vertices.length; i += 3) {
        if (i + 2 >= vertices.length) break;
        const v1 = vertices[i];
        const v2 = vertices[i + 1];
        const v3 = vertices[i + 2];

        const vol = (v1.x * v2.y * v3.z - v1.x * v2.z * v3.y - v1.y * v2.x * v3.z + v1.y * v2.z * v3.x + v1.z * v2.x * v3.y - v1.z * v2.y * v3.x) / 6.0;
        totalVolume += vol;
      }
    }

    // Absolute volume in mm^3
    const volumeMm3 = Math.abs(totalVolume);
    // Convert to cm^3 (divide by 1000)
    const volumeCm3 = volumeMm3 / 1000;
    
    // PLA density is approx 1.24 g/cm^3
    // Standard infill is about 15%
    // Weight (g) = volume (cm^3) * 1.24 * 0.15
    const density = 1.24;
    const infill = 0.15;
    let weightGrams = Math.round(volumeCm3 * density * infill);
    
    // Add a minimum weight of 3 grams if volume is extremely small but exists
    if (weightGrams < 3 && volumeMm3 > 0) {
      weightGrams = 3;
    }

    // Estimate print time:
    // Printing 1g takes about 4.5 minutes on average, plus a base offset of 25 minutes for heating & setup
    let printTimeMinutes = Math.round(weightGrams * 4.5 + 25);
    if (printTimeMinutes < 15 && volumeMm3 > 0) {
      printTimeMinutes = 15;
    }

    return {
      weightGrams: weightGrams || 20,
      printTimeMinutes: printTimeMinutes || 90
    };
  } catch (error) {
    console.error('[STL Analyzer] Error analyzing STL file:', error);
    return { weightGrams: 20, printTimeMinutes: 90 };
  }
}

// Initialize: Try to detect Cura path if not set
try {
  const db = readDb();
  if (!db.settings.curaPath) {
    const detected = detectCuraPath();
    if (detected) {
      db.settings.curaPath = detected;
      writeDb(db);
      console.log(`[Init] Automatically set Cura path to: ${detected}`);
    } else {
      console.log('[Init] Ultimaker Cura was not automatically detected on this Windows machine.');
    }
  }
} catch (error) {
  console.error('[Init] Error during database/Cura initialization:', error);
}

// Multer Storage Configuration for STL/3MF files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});
const upload = multer({ storage });

// ==========================================
// API ROUTES
// ==========================================

// 1. Settings Endpoints
app.get('/api/settings', (req, res) => {
  const db = readDb();
  res.json(db.settings);
});

app.put('/api/settings', (req, res) => {
  const db = readDb();
  db.settings = { ...db.settings, ...req.body };
  writeDb(db);
  res.json(db.settings);
});

// 2. Materials (Filaments) Endpoints
app.get('/api/materials', (req, res) => {
  const db = readDb();
  res.json(db.materials);
});

app.post('/api/materials', (req, res) => {
  const db = readDb();
  const newMaterial = {
    id: 'mat-' + Date.now(),
    name: req.body.name || 'Filament nou',
    colorHex: req.body.colorHex || '#3b82f6',
    texture: req.body.texture || 'Mat',
    pricePerGram: parseFloat(req.body.pricePerGram) || 0.15,
    inStock: req.body.inStock !== undefined ? req.body.inStock : true,
    stockGrams: parseInt(req.body.stockGrams) || 1000
  };
  db.materials.push(newMaterial);
  writeDb(db);
  res.status(201).json(newMaterial);
});

app.put('/api/materials/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const index = db.materials.findIndex(m => m.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Materialul nu a fost găsit' });
  }
  
  db.materials[index] = {
    ...db.materials[index],
    name: req.body.name,
    colorHex: req.body.colorHex,
    texture: req.body.texture,
    pricePerGram: parseFloat(req.body.pricePerGram),
    inStock: req.body.inStock,
    stockGrams: parseInt(req.body.stockGrams)
  };
  writeDb(db);
  res.json(db.materials[index]);
});

app.delete('/api/materials/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const index = db.materials.findIndex(m => m.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Materialul nu a fost găsit' });
  }
  const deleted = db.materials.splice(index, 1);
  writeDb(db);
  res.json(deleted[0]);
});

// 3. Models Endpoints
app.get('/api/models', (req, res) => {
  const db = readDb();
  res.json(db.models);
});

app.post('/api/models', (req, res) => {
  const db = readDb();
  const newModel = {
    id: 'model-' + Date.now(),
    title: req.body.title || 'Model nou 3D',
    description: req.body.description || '',
    printablesUrl: req.body.printablesUrl || '',
    imageUrl: req.body.imageUrl || '',
    weightGrams: parseFloat(req.body.weightGrams) || 0,
    printTimeMinutes: parseInt(req.body.printTimeMinutes) || 0,
    fileName: req.body.fileName || '',
    localPath: req.body.localPath || '',
    category: req.body.category || 'Altele'
  };
  db.models.push(newModel);
  writeDb(db);
  res.status(201).json(newModel);
});

app.put('/api/models/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const index = db.models.findIndex(m => m.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Modelul nu a fost găsit' });
  }

  db.models[index] = {
    ...db.models[index],
    title: req.body.title,
    description: req.body.description,
    printablesUrl: req.body.printablesUrl,
    imageUrl: req.body.imageUrl,
    weightGrams: parseFloat(req.body.weightGrams),
    printTimeMinutes: parseInt(req.body.printTimeMinutes),
    fileName: req.body.fileName,
    localPath: req.body.localPath,
    category: req.body.category
  };
  writeDb(db);
  res.json(db.models[index]);
});

app.delete('/api/models/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const index = db.models.findIndex(m => m.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Modelul nu a fost găsit' });
  }

  // Delete the physical file from disk if it exists in uploads/
  const model = db.models[index];
  if (model.localPath) {
    const fullFilePath = path.join(process.cwd(), model.localPath);
    if (fs.existsSync(fullFilePath) && model.localPath.startsWith('uploads/')) {
      try {
        fs.unlinkSync(fullFilePath);
        console.log(`[Cleanup] Deleted file: ${fullFilePath}`);
      } catch (err) {
        console.error(`[Cleanup] Failed to delete file: ${fullFilePath}`, err);
      }
    }
  }

  const deleted = db.models.splice(index, 1);
  writeDb(db);
  res.json(deleted[0]);
});

// 4. File Upload Endpoint (STL/3MF)
app.post('/api/models/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Niciun fișier nu a fost încărcat' });
  }
  const relativePath = `uploads/${req.file.filename}`;
  res.json({
    fileName: req.file.originalname,
    localPath: relativePath
  });
});

// 5. Scrape Printables Metadata Endpoint
app.post('/api/models/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL-ul Printables este obligatoriu' });
  }

  // Try GraphQL API primary method first (bypasses Cloudflare block on main website)
  try {
    const match = url.match(/printables\.com\/(?:[a-z\-]+\/)?model\/(\d+)/) || url.match(/\/model\/(\d+)/);
    if (match && match[1]) {
      const modelId = match[1];
      console.log(`[Scraper] Using GraphQL API to fetch model details for ID: ${modelId}`);
      
      const gqlQuery = `
        query PrintProfile($id: ID!) {
          print(id: $id) {
            id
            slug
            name
            description
            summary
            image {
              filePath
            }
            stls {
              id
              name
              fileSize
            }
          }
        }
      `;

      const gqlResponse = await axios.post('https://api.printables.com/graphql/', {
        operationName: 'PrintProfile',
        query: gqlQuery,
        variables: { id: modelId }
      }, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (gqlResponse.data && gqlResponse.data.data && gqlResponse.data.data.print) {
        const printData = gqlResponse.data.data.print;
        const title = printData.name;
        // Fallback to summary if description HTML is empty
        let description = printData.description || printData.summary || '';
        // Strip HTML tags for clean text display
        description = description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        
        let imageUrl = '';
        if (printData.image && printData.image.filePath) {
          imageUrl = `https://media.printables.com/${printData.image.filePath}`;
        }

        let fileName = '';
        let localPath = '';

        // Auto-download first STL if available
        if (printData.stls && printData.stls.length > 0) {
          const mainStl = printData.stls[0];
          console.log(`[Scraper] Found STL file: "${mainStl.name}" (ID: ${mainStl.id}). Attempting auto-download...`);
          try {
            const gqlMutation = `
              mutation GetDownloadLink($id: ID!, $modelId: ID!, $fileType: DownloadFileTypeEnum!, $source: DownloadSourceEnum!) {
                getDownloadLink(id: $id, printId: $modelId, fileType: $fileType, source: $source) {
                  ok
                  output {
                    link
                  }
                }
              }
            `;
            
            const downloadLinkResponse = await axios.post('https://api.printables.com/graphql/', {
              operationName: 'GetDownloadLink',
              query: gqlMutation,
              variables: {
                fileType: 'stl',
                id: mainStl.id,
                modelId: modelId,
                source: 'model_detail'
              }
            }, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Content-Type': 'application/json'
              },
              timeout: 10000
            });

            if (downloadLinkResponse.data && downloadLinkResponse.data.data && downloadLinkResponse.data.data.getDownloadLink && downloadLinkResponse.data.data.getDownloadLink.ok) {
              const downloadLink = downloadLinkResponse.data.data.getDownloadLink.output.link;
              console.log(`[Scraper] Retrieved direct link: ${downloadLink}`);

              // Download file content
              const fileRes = await axios.get(downloadLink, {
                responseType: 'arraybuffer',
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 30000
              });

              // Generate filename and save path
              const safeName = mainStl.name.replace(/[^a-zA-Z0-9\.\-_]/g, '_');
              const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
              const extension = path.extname(safeName) || '.stl';
              const baseWithoutExt = path.basename(safeName, extension);
              const savedFilename = `${baseWithoutExt}-${uniqueSuffix}${extension}`;
              const relativePath = `uploads/${savedFilename}`;
              const absolutePath = path.join(process.cwd(), relativePath);

              fs.writeFileSync(absolutePath, fileRes.data);
              fileName = mainStl.name;
              localPath = relativePath;
              console.log(`[Scraper] Successfully auto-downloaded file to: ${relativePath}`);
            }
          } catch (dlErr) {
            console.error('[Scraper Error] Failed to auto-download STL file:', dlErr.message);
          }
        }

        let weightGrams = 20;
        let printTimeMinutes = 90;

        if (localPath) {
          const absolutePath = path.join(process.cwd(), localPath);
          const stats = calculateStlVolumeAndWeight(absolutePath);
          weightGrams = stats.weightGrams;
          printTimeMinutes = stats.printTimeMinutes;
        }

        console.log(`[Scraper] GraphQL successfully fetched: "${title}" (Calculated: ${weightGrams}g, ${printTimeMinutes}m)`);
        return res.json({
          title,
          imageUrl,
          description: description.substring(0, 300),
          fileName,
          localPath,
          weightGrams,
          printTimeMinutes
        });
      }
    }
  } catch (gqlErr) {
    console.warn('[Scraper Warning] GraphQL API failed, falling back to HTML parsing:', gqlErr.message);
  }

  // Fallback to Cheerio HTML scraper if GraphQL fails or no ID found
  try {
    console.log('[Scraper] Falling back to Cheerio HTML scraper for URL:', url);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    
    // Scrape standard Open Graph metadata tags
    const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const ogDescription = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';

    // Clean up title (Printables page titles end with " | Printables.com")
    let title = ogTitle.split('|')[0].trim();

    res.json({
      title,
      imageUrl: ogImage,
      description: ogDescription
    });
  } catch (error) {
    console.error('[Scraper Error]:', error.message);
    res.status(500).json({ error: 'Nu s-au putut prelua datele automat. Verificați link-ul sau completați manual.' });
  }
});

// 6. Open File in local Ultimaker Cura
app.post('/api/models/:id/print', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const model = db.models.find(m => m.id === id);

  if (!model) {
    return res.status(404).json({ error: 'Modelul nu a fost găsit' });
  }

  // Get cura path
  const curaPath = db.settings.curaPath || detectCuraPath();
  if (!curaPath) {
    return res.status(400).json({ 
      error: 'Calea către Ultimaker Cura nu este configurată sau nu a putut fi detectată pe acest calculator. Configurați-o în panoul de Setări.' 
    });
  }

  if (!fs.existsSync(curaPath)) {
    return res.status(400).json({ 
      error: `Ultimaker Cura nu a fost găsit la calea configurată: "${curaPath}"` 
    });
  }

  // Get local file path
  if (!model.localPath) {
    return res.status(400).json({ error: 'Acest model nu are asociat niciun fișier STL/3MF încărcat.' });
  }

  const filePath = path.resolve(process.cwd(), model.localPath);
  if (!fs.existsSync(filePath)) {
    return res.status(400).json({ error: `Fișierul fizic nu a fost găsit pe server la calea: "${filePath}"` });
  }

  console.log(`[Cura Launcher] Launching: "${curaPath}" with file: "${filePath}"`);

  // Launch Cura process using spawn for robust argument handling on Windows (spaces in paths, etc.)
  try {
    const child = spawn(curaPath, [filePath], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
  } catch (err) {
    console.error(`[Cura Launcher] Spawn failed:`, err.message);
  }

  res.json({ 
    success: true, 
    message: `Se deschide modelul "${model.title}" direct în Ultimaker Cura!` 
  });
});

// 7. Orders Endpoints
app.get('/api/orders', (req, res) => {
  const db = readDb();
  res.json(db.orders || []);
});

app.post('/api/orders', (req, res) => {
  const db = readDb();
  if (!db.orders) db.orders = [];

  const newOrder = {
    id: 'order-' + Date.now(),
    buyerName: req.body.buyerName || 'Cumpărător Anonim',
    printablesUrl: req.body.printablesUrl || '',
    title: req.body.title || 'Model Personalizat',
    imageUrl: req.body.imageUrl || '',
    description: req.body.description || '',
    weightGrams: parseFloat(req.body.weightGrams) || 15,
    printTimeMinutes: parseInt(req.body.printTimeMinutes) || 60,
    materialId: req.body.materialId || '',
    price: parseFloat(req.body.price) || 0,
    status: 'pending', // 'pending', 'accepted', 'rejected'
    fileName: req.body.fileName || '',
    localPath: req.body.localPath || '',
    createdAt: new Date().toISOString()
  };
  
  db.orders.push(newOrder);
  writeDb(db);
  res.status(201).json(newOrder);
});

app.put('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const index = db.orders.findIndex(o => o.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Comanda nu a fost găsită' });
  }

  // Update order fields
  const weightGrams = parseFloat(req.body.weightGrams) || 0;
  const printTimeMinutes = parseInt(req.body.printTimeMinutes) || 0;
  const materialId = req.body.materialId || db.orders[index].materialId;

  // Recalculate price
  const selectedMat = db.materials.find(m => m.id === materialId);
  let price = db.orders[index].price;
  if (selectedMat) {
    const timeHours = printTimeMinutes / 60;
    const elecCost = db.settings.electricityCostPerHour || 0.6;
    const hourlyLaborCost = db.settings.hourlyRate || 4.0;
    const startupFee = db.settings.flatLaborFee || 5.0;
    const markupMultiplier = 1 + ((db.settings.markupPercent || 40) / 100);

    const costMaterial = weightGrams * selectedMat.pricePerGram;
    const costElectricity = timeHours * elecCost;
    const costLabor = timeHours * hourlyLaborCost;
    
    const costBase = costMaterial + costElectricity + costLabor + startupFee;
    price = parseFloat((costBase * markupMultiplier).toFixed(2));
  }

  db.orders[index] = {
    ...db.orders[index],
    weightGrams,
    printTimeMinutes,
    materialId,
    price
  };

  writeDb(db);
  res.json(db.orders[index]);
});

app.put('/api/orders/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'accepted' or 'rejected'
  
  if (status !== 'accepted' && status !== 'rejected' && status !== 'pending') {
    return res.status(400).json({ error: 'Status invalid' });
  }

  const db = readDb();
  const index = db.orders.findIndex(o => o.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Comanda nu a fost găsită' });
  }

  db.orders[index].status = status;
  writeDb(db);
  res.json(db.orders[index]);
});

// Upload STL file specifically for an order
app.post('/api/orders/:id/upload', upload.single('file'), (req, res) => {
  const { id } = req.params;
  if (!req.file) {
    return res.status(400).json({ error: 'Niciun fișier nu a fost încărcat' });
  }

  const db = readDb();
  const index = db.orders.findIndex(o => o.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Comanda nu a fost găsită' });
  }

  const relativePath = `uploads/${req.file.filename}`;
  db.orders[index].localPath = relativePath;
  db.orders[index].fileName = req.file.originalname;

  writeDb(db);
  res.json({
    fileName: req.file.originalname,
    localPath: relativePath,
    order: db.orders[index]
  });
});

// Open Order File in local Ultimaker Cura
app.post('/api/orders/:id/print', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const order = db.orders.find(o => o.id === id);

  if (!order) {
    return res.status(404).json({ error: 'Comanda nu a fost găsită' });
  }

  // Get cura path
  const curaPath = db.settings.curaPath || detectCuraPath();
  if (!curaPath) {
    return res.status(400).json({ 
      error: 'Calea către Ultimaker Cura nu este configurată sau nu a putut fi detectată pe acest calculator. Configurați-o în panoul de Setări.' 
    });
  }

  if (!fs.existsSync(curaPath)) {
    return res.status(400).json({ 
      error: `Ultimaker Cura nu a fost găsit la calea configurată: "${curaPath}"` 
    });
  }

  // Get local file path
  if (!order.localPath) {
    return res.status(400).json({ error: 'Această comandă nu are asociat niciun fișier STL/3MF încărcat.' });
  }

  const filePath = path.resolve(process.cwd(), order.localPath);
  if (!fs.existsSync(filePath)) {
    return res.status(400).json({ error: `Fișierul fizic nu a fost găsit pe server la calea: "${filePath}"` });
  }

  console.log(`[Cura Launcher] Launching Cura for Order: "${curaPath}" with file: "${filePath}"`);

  // Launch Cura process using spawn for robust argument handling on Windows (spaces in paths, etc.)
  try {
    const child = spawn(curaPath, [filePath], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
  } catch (err) {
    console.error(`[Cura Launcher] Order spawn failed:`, err.message);
  }

  res.json({ 
    success: true, 
    message: `Se deschide modelul din comandă direct în Ultimaker Cura!` 
  });
});

// Delete an order
app.delete('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const index = db.orders.findIndex(o => o.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Comanda nu a fost găsită' });
  }

  // Delete physical file if it exists
  const order = db.orders[index];
  if (order.localPath) {
    const filePath = path.resolve(process.cwd(), order.localPath);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`[Server] Deleted physical STL file for order: ${filePath}`);
      } catch (err) {
        console.warn(`[File Delete Warning] Failed to delete physical file: ${filePath}`, err.message);
      }
    }
  }

  db.orders.splice(index, 1);
  writeDb(db);
  res.json({ success: true, message: 'Comanda a fost ștearsă cu succes' });
});

// Serve static frontend files in production
app.use(express.static(path.join(process.cwd(), 'dist')));

// Fallback all non-API and non-upload routes to index.html
app.get('/{*all}', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }
  const indexPath = path.join(process.cwd(), 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend not built. Please run "npm run build" first.');
  }
});

app.listen(PORT, () => {
  console.log(`[Server] Express server running on http://localhost:${PORT}`);
});
