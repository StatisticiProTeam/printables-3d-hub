import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  // Authentication & Session States
  const [user, setUser] = useState(() => {
    const saved = sessionStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [adminPassword, setAdminPassword] = useState('');
  const [buyerNameInput, setBuyerNameInput] = useState('');
  const [loginTab, setLoginTab] = useState('buyer'); // 'buyer' or 'admin'
  const [loginError, setLoginError] = useState('');
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Application database states
  const [models, setModels] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState({
    curaPath: '',
    markupPercent: 40,
    electricityCostPerHour: 0.6,
    hourlyRate: 4.0,
    flatLaborFee: 5.0
  });

  // UI state navigation
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog', 'admin', 'custom-request', 'my-orders'
  const [activeAdminTab, setActiveAdminTab] = useState('orders'); // 'orders', 'settings', 'materials', 'models'
  
  // Modal & Notification states
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState({
    models: false,
    materials: false,
    settings: false,
    orders: false,
    scrape: false,
    upload: false,
    print: null,
    orderUpload: null
  });

  // Custom Request Form State (for Buyer)
  const [customRequestForm, setCustomRequestForm] = useState({
    printablesUrl: '',
    title: '',
    description: '',
    imageUrl: '',
    weightGrams: 20,
    printTimeMinutes: 90,
    materialId: '',
    fileName: '',
    localPath: ''
  });

  // Admin Form States - Materials
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [materialForm, setMaterialForm] = useState({
    name: '',
    colorHex: '#3b82f6',
    texture: 'Mat',
    pricePerGram: 0.15,
    inStock: true,
    stockGrams: 1000
  });

  // Admin Form States - Models
  const [editingModel, setEditingModel] = useState(null);
  const [modelForm, setModelForm] = useState({
    title: '',
    description: '',
    printablesUrl: '',
    imageUrl: '',
    weightGrams: 15,
    printTimeMinutes: 60,
    fileName: '',
    localPath: '',
    category: 'Jucării'
  });

  // Fetch initial data on boot
  useEffect(() => {
    fetchSettings();
    fetchMaterials();
    fetchModels();
    if (user) {
      fetchOrders();
    }
  }, [user]);

  // Toast notifications helper
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Auth Handlers
  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError('');

    if (loginTab === 'admin') {
      if (adminPassword === '1234') {
        const sessionUser = { role: 'admin', name: 'Administrator' };
        setUser(sessionUser);
        sessionStorage.setItem('user', JSON.stringify(sessionUser));
        setActiveTab('catalog');
        setActiveAdminTab('orders');
        showNotification('Welcome back, Admin!');
      } else {
        setLoginError('Incorrect password. Please try again.');
      }
    } else {
      if (buyerNameInput.trim()) {
        const sessionUser = { role: 'buyer', name: buyerNameInput.trim() };
        setUser(sessionUser);
        sessionStorage.setItem('user', JSON.stringify(sessionUser));
        setActiveTab('catalog');
        showNotification(`Welcome, ${buyerNameInput.trim()}!`);
      } else {
        setLoginError('Please enter your name to proceed.');
      }
    }
  };

  const handleLogout = () => {
    setUser(null);
    sessionStorage.removeItem('user');
    setActiveTab('catalog');
    setSelectedModel(null);
    setSelectedMaterial(null);
    setAdminPassword('');
    setBuyerNameInput('');
  };

  // Database API Requests
  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error(err);
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      setSettings(data);
      showNotification('Setările au fost salvate cu succes!');
    } catch (err) {
      showNotification('Eroare la salvarea setărilor.', 'error');
    }
  };

  const detectCura = async () => {
    showNotification('Se caută Ultimaker Cura...');
    try {
      const res = await fetch('/api/settings');
      const currentSettings = await res.json();
      
      const resUpdate = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...currentSettings, curaPath: '' })
      });
      const data = await resUpdate.json();
      setSettings(data);

      if (data.curaPath) {
        showNotification(`Cura detectat: ${data.curaPath}`);
      } else {
        showNotification('Cura nu a fost detectat automat. Introduceți calea manual.', 'error');
      }
    } catch (err) {
      showNotification('Eroare la detectarea Cura.', 'error');
    }
  };

  const fetchMaterials = async () => {
    try {
      const res = await fetch('/api/materials');
      const data = await res.json();
      setMaterials(data);
      
      // Select first in-stock material in form if empty
      const firstInStock = data.find(m => m.inStock);
      if (firstInStock && !customRequestForm.materialId) {
        setCustomRequestForm(prev => ({ ...prev, materialId: firstInStock.id }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchModels = async () => {
    setLoading(prev => ({ ...prev, models: true }));
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      setModels(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(prev => ({ ...prev, models: false }));
    }
  };

  const fetchOrders = async () => {
    setLoading(prev => ({ ...prev, orders: true }));
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      // Sort orders descending (newest first)
      setOrders(data.reverse());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(prev => ({ ...prev, orders: false }));
    }
  };

  // Pricing Dynamic Formula Calculator
  const calculatePrice = (model, material) => {
    if (!model || !material) return { total: 0, breakdown: null };

    const weight = model.weightGrams;
    const matPrice = material.pricePerGram;
    const timeHours = model.printTimeMinutes / 60;
    
    const elecCost = settings.electricityCostPerHour;
    const hourlyLaborCost = settings.hourlyRate;
    const startupFee = settings.flatLaborFee;
    const markupMultiplier = 1 + (settings.markupPercent / 100);

    const costMaterial = weight * matPrice;
    const costElectricity = timeHours * elecCost;
    const costLabor = timeHours * hourlyLaborCost;
    
    const costBase = costMaterial + costElectricity + costLabor + startupFee;
    const costTotal = costBase * markupMultiplier;

    return {
      total: costTotal.toFixed(2),
      breakdown: {
        material: costMaterial.toFixed(2),
        electricity: costElectricity.toFixed(2),
        labor: costLabor.toFixed(2),
        startup: startupFee.toFixed(2),
        markupValue: (costTotal - costBase).toFixed(2),
        baseTotal: costBase.toFixed(2)
      }
    };
  };

  // Buyer: Submit Custom Request from Printables
  const handleScrapeCustom = async () => {
    if (!customRequestForm.printablesUrl) {
      showNotification('Introduceți un link de pe Printables.com', 'warning');
      return;
    }
    setLoading(prev => ({ ...prev, scrape: true }));
    showNotification('Se preiau datele de pe Printables...');
    try {
      const res = await fetch('/api/models/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: customRequestForm.printablesUrl })
      });
      const data = await res.json();

      if (res.ok) {
        setCustomRequestForm(prev => ({
          ...prev,
          title: data.title || 'Model Personalizat Importat',
          description: data.description || '',
          imageUrl: data.imageUrl || '',
          fileName: data.fileName || '',
          localPath: data.localPath || '',
          weightGrams: data.weightGrams || 20,
          printTimeMinutes: data.printTimeMinutes || 90
        }));
        showNotification('Datele modelului au fost preluate!');
      } else {
        showNotification(data.error || 'Nu s-au putut prelua datele.', 'error');
      }
    } catch (err) {
      showNotification('Eroare conexiune server.', 'error');
    } finally {
      setLoading(prev => ({ ...prev, scrape: false }));
    }
  };

  const handleCustomRequestSubmit = async (e) => {
    e.preventDefault();
    if (!customRequestForm.title) {
      showNotification('Preluați datele modelului sau scrieți un titlu.', 'warning');
      return;
    }

    const selectedMat = materials.find(m => m.id === customRequestForm.materialId);
    const { total } = calculatePrice(customRequestForm, selectedMat);

    const payload = {
      buyerName: user.name,
      printablesUrl: customRequestForm.printablesUrl,
      title: customRequestForm.title,
      imageUrl: customRequestForm.imageUrl,
      description: customRequestForm.description,
      weightGrams: parseFloat(customRequestForm.weightGrams),
      printTimeMinutes: parseInt(customRequestForm.printTimeMinutes),
      materialId: customRequestForm.materialId,
      price: parseFloat(total),
      fileName: customRequestForm.fileName || '',
      localPath: customRequestForm.localPath || ''
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showNotification('Cererea de printare a fost trimisă cu succes!');
        // Reset form
        const inStockMat = materials.find(m => m.inStock);
        setCustomRequestForm({
          printablesUrl: '',
          title: '',
          description: '',
          imageUrl: '',
          weightGrams: 20,
          printTimeMinutes: 90,
          materialId: inStockMat ? inStockMat.id : '',
          fileName: '',
          localPath: ''
        });
        fetchOrders();
        setActiveTab('my-orders');
      } else {
        showNotification('Eroare la trimiterea cererii.', 'error');
      }
    } catch (err) {
      showNotification('Eroare rețea.', 'error');
    }
  };

  // Buyer: Order standard Catalog model
  const handleOrderCatalogModel = async () => {
    if (!selectedModel || !selectedMaterial) return;

    const { total } = calculatePrice(selectedModel, selectedMaterial);

    const payload = {
      buyerName: user.name,
      printablesUrl: selectedModel.printablesUrl,
      title: selectedModel.title,
      imageUrl: selectedModel.imageUrl,
      description: selectedModel.description,
      weightGrams: selectedModel.weightGrams,
      printTimeMinutes: selectedModel.printTimeMinutes,
      materialId: selectedMaterial.id,
      price: parseFloat(total),
      fileName: selectedModel.fileName || '',
      localPath: selectedModel.localPath || ''
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showNotification('Comanda din catalog a fost trimisă!');
        setSelectedModel(null);
        fetchOrders();
        setActiveTab('my-orders');
      } else {
        showNotification('Nu s-a putut trimite comanda.', 'error');
      }
    } catch (err) {
      showNotification('Eroare rețea.', 'error');
    }
  };

  // Admin: Update order status (Accept/Reject)
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (res.ok) {
        showNotification(newStatus === 'accepted' ? 'Comandă Acceptată!' : 'Comandă Respinsă!');
        fetchOrders();
      } else {
        showNotification('Eroare la actualizarea statusului.', 'error');
      }
    } catch (err) {
      showNotification('Eroare rețea.', 'error');
    }
  };

  // Admin: Delete order permanent
  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm('Sigur doriți să ștergeți această comandă permanent?')) return;
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        showNotification('Comanda a fost ștearsă cu succes!');
        fetchOrders();
      } else {
        const err = await res.json();
        showNotification(err.error || 'Eroare la ștergerea comenzii.', 'error');
      }
    } catch (err) {
      showNotification('Eroare rețea la ștergere.', 'error');
    }
  };

  // Admin: Update order parameters (weight, printTime, material)
  const handleEditOrderSpecs = async (orderId, updatedSpecs) => {
    try {
      const existingOrder = orders.find(o => o.id === orderId);
      if (!existingOrder) return;

      const payload = {
        weightGrams: updatedSpecs.weightGrams !== undefined ? updatedSpecs.weightGrams : existingOrder.weightGrams,
        printTimeMinutes: updatedSpecs.printTimeMinutes !== undefined ? updatedSpecs.printTimeMinutes : existingOrder.printTimeMinutes,
        materialId: updatedSpecs.materialId !== undefined ? updatedSpecs.materialId : existingOrder.materialId
      };

      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        fetchOrders();
      } else {
        showNotification('Eroare la actualizarea specificațiilor.', 'error');
      }
    } catch (err) {
      showNotification('Eroare rețea.', 'error');
    }
  };

  // Admin: Upload STL file directly for an accepted order
  const handleOrderFileUpload = async (e, orderId) => {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'stl' && ext !== '3mf') {
      showNotification('Doar fișierele .stl sau .3mf sunt suportate', 'error');
      return;
    }

    setLoading(prev => ({ ...prev, orderUpload: orderId }));
    showNotification('Se încarcă fișierul 3D pentru comandă...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/orders/${orderId}/upload`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        showNotification('Fișier STL atașat cu succes comenzii!');
        fetchOrders();
      } else {
        const err = await res.json();
        showNotification(err.error || 'Eroare la încărcare.', 'error');
      }
    } catch (err) {
      showNotification('Eroare rețea la încărcare.', 'error');
    } finally {
      setLoading(prev => ({ ...prev, orderUpload: null }));
    }
  };

  // Admin: Open order file in Cura
  const handlePrintOrderInCura = async (orderId) => {
    setLoading(prev => ({ ...prev, print: orderId }));
    try {
      const res = await fetch(`/api/orders/${orderId}/print`, { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        showNotification(data.message || 'Se deschide în Ultimaker Cura!', 'success');
      } else {
        showNotification(data.error || 'Eroare la deschiderea fișierului.', 'error');
      }
    } catch (err) {
      showNotification('Eroare rețea la trimiterea în Cura.', 'error');
    } finally {
      setLoading(prev => ({ ...prev, print: null }));
    }
  };

  // Admin: Open catalog model file in Cura
  const handlePrintModelInCura = async (modelId) => {
    setLoading(prev => ({ ...prev, printModel: modelId }));
    try {
      const res = await fetch(`/api/models/${modelId}/print`, { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        showNotification(data.message || 'Se deschide în Ultimaker Cura!', 'success');
      } else {
        showNotification(data.error || 'Eroare la deschiderea fișierului.', 'error');
      }
    } catch (err) {
      showNotification('Eroare rețea la trimiterea în Cura.', 'error');
    } finally {
      setLoading(prev => ({ ...prev, printModel: null }));
    }
  };

  // Admin: Filament / Material CRUD handlers
  const handleMaterialSubmit = async (e) => {
    e.preventDefault();
    const url = editingMaterial ? `/api/materials/${editingMaterial.id}` : '/api/materials';
    const method = editingMaterial ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(materialForm)
      });
      
      if (res.ok) {
        showNotification(editingMaterial ? 'Filament actualizat!' : 'Filament adăugat!');
        fetchMaterials();
        resetMaterialForm();
      } else {
        const err = await res.json();
        showNotification(err.error || 'Eroare la salvare.', 'error');
      }
    } catch (err) {
      showNotification('Eroare salvare.', 'error');
    }
  };

  const startEditMaterial = (material) => {
    setEditingMaterial(material);
    setMaterialForm({
      name: material.name,
      colorHex: material.colorHex,
      texture: material.texture,
      pricePerGram: material.pricePerGram,
      inStock: material.inStock,
      stockGrams: material.stockGrams
    });
  };

  const deleteMaterial = async (id) => {
    if (!window.confirm('Sigur doriți să ștergeți acest filament?')) return;
    try {
      const res = await fetch(`/api/materials/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification('Filament șters!');
        fetchMaterials();
      }
    } catch (err) {
      showNotification('Eroare la ștergere.', 'error');
    }
  };

  const resetMaterialForm = () => {
    setEditingMaterial(null);
    setMaterialForm({
      name: '',
      colorHex: '#3b82f6',
      texture: 'Mat',
      pricePerGram: 0.15,
      inStock: true,
      stockGrams: 1000
    });
  };

  // Admin: Catalog models CRUD handlers
  const handleModelSubmit = async (e) => {
    e.preventDefault();
    const url = editingModel ? `/api/models/${editingModel.id}` : '/api/models';
    const method = editingModel ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelForm)
      });

      if (res.ok) {
        showNotification(editingModel ? 'Model 3D actualizat!' : 'Model 3D adăugat!');
        fetchModels();
        resetModelForm();
      } else {
        const err = await res.json();
        showNotification(err.error || 'Eroare la salvare.', 'error');
      }
    } catch (err) {
      showNotification('Eroare salvare.', 'error');
    }
  };

  const startEditModel = (model) => {
    setEditingModel(model);
    setModelForm({
      title: model.title,
      description: model.description,
      printablesUrl: model.printablesUrl,
      imageUrl: model.imageUrl,
      weightGrams: model.weightGrams,
      printTimeMinutes: model.printTimeMinutes,
      fileName: model.fileName,
      localPath: model.localPath,
      category: model.category
    });
  };

  const deleteModel = async (id) => {
    if (!window.confirm('Sigur ștergeți acest model?')) return;
    try {
      const res = await fetch(`/api/models/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification('Model șters!');
        fetchModels();
      }
    } catch (err) {
      showNotification('Eroare ștergere.', 'error');
    }
  };

  const resetModelForm = () => {
    setEditingModel(null);
    setModelForm({
      title: '',
      description: '',
      printablesUrl: '',
      imageUrl: '',
      weightGrams: 15,
      printTimeMinutes: 60,
      fileName: '',
      localPath: '',
      category: 'Jucării'
    });
  };

  const handleCatalogScrape = async () => {
    if (!modelForm.printablesUrl) {
      showNotification('Introduceți un URL de pe Printables.com', 'warning');
      return;
    }
    setLoading(prev => ({ ...prev, scrape: true }));
    showNotification('Se preiau datele de pe Printables...');
    try {
      const res = await fetch('/api/models/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: modelForm.printablesUrl })
      });
      const data = await res.json();
      if (res.ok) {
        setModelForm(prev => ({
          ...prev,
          title: data.title || prev.title,
          description: data.description || prev.description,
          imageUrl: data.imageUrl || prev.imageUrl
        }));
        showNotification('Date autocompletate!');
      } else {
        showNotification(data.error || 'Eroare la preluare.', 'error');
      }
    } catch (err) {
      showNotification('Eroare server.', 'error');
    } finally {
      setLoading(prev => ({ ...prev, scrape: false }));
    }
  };

  const handleCatalogFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(prev => ({ ...prev, upload: true }));
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/models/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setModelForm(prev => ({
          ...prev,
          fileName: data.fileName,
          localPath: data.localPath
        }));
        showNotification('Fișier încărcat cu succes!');
      } else {
        showNotification(data.error || 'Eroare la încărcare.', 'error');
      }
    } catch (err) {
      showNotification('Eroare încărcare.', 'error');
    } finally {
      setLoading(prev => ({ ...prev, upload: false }));
    }
  };

  const openModelPreview = (model) => {
    setSelectedModel(model);
    const available = materials.find(m => m.inStock);
    if (available) {
      setSelectedMaterial(available);
    } else if (materials.length > 0) {
      setSelectedMaterial(materials[0]);
    }
  };

  // UNAUTHENTICATED LOGIN SCREEN (In English, Premium CSS)
  if (!user) {
    return (
      <div className="login-screen-container">
        <div className="login-box glass">
          <div className="login-logo">
            <i className="fa-solid fa-cube"></i>
            <h2>Printables 3D Cura Hub</h2>
          </div>
          <p className="login-subtitle">Secure Access Portal. Please select your role below to log in.</p>
          
          <div className="login-tabs">
            <button 
              className={`login-tab-btn ${loginTab === 'buyer' ? 'active' : ''}`}
              onClick={() => { setLoginTab('buyer'); setLoginError(''); }}
            >
              <i className="fa-solid fa-user-tag"></i> Buyer Portal
            </button>
            <button 
              className={`login-tab-btn ${loginTab === 'admin' ? 'active' : ''}`}
              onClick={() => { setLoginTab('admin'); setLoginError(''); }}
            >
              <i className="fa-solid fa-user-shield"></i> Admin Dashboard
            </button>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            {loginError && <div className="login-error-msg"><i className="fa-solid fa-triangle-exclamation"></i> {loginError}</div>}
            
            {loginTab === 'admin' ? (
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label">Admin Security Code</label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-key input-icon"></i>
                  <input 
                    type="password"
                    className="form-input"
                    placeholder="Enter password..."
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            ) : (
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label">Your Full Name</label>
                <div className="input-wrapper">
                  <i className="fa-solid fa-user input-icon"></i>
                  <input 
                    type="text"
                    className="form-input"
                    placeholder="e.g. John Doe"
                    value={buyerNameInput}
                    onChange={e => setBuyerNameInput(e.target.value)}
                    required
                  />
                </div>
                <small style={{ color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
                  Your name is used to link and check your 3D print orders.
                </small>
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', justifyContent: 'center' }}>
              {loginTab === 'admin' ? 'Unlock Dashboard' : 'Enter 3D Print Hub'} <i className="fa-solid fa-circle-arrow-right"></i>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Toast Notification */}
      {notification && (
        <div className={`notification-banner glass ${notification.type}`}>
          <i className={
            notification.type === 'success' ? 'fa-solid fa-circle-check text-green' : 
            notification.type === 'warning' ? 'fa-solid fa-triangle-exclamation text-yellow' : 
            'fa-solid fa-circle-xmark text-red'
          }></i>
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div className="container header-content">
          <a href="#" className="logo" onClick={() => setActiveTab('catalog')}>
            <i className="fa-solid fa-cube"></i>
            <span>Printables<span className="text-accent">Cura</span>Hub</span>
          </a>
          
          <nav className="nav-links">
            {/* Common links */}
            <button 
              className={`btn ${activeTab === 'catalog' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('catalog')}
            >
              <i className="fa-solid fa-store"></i> Catalog Modele
            </button>

            {/* Buyer Links */}
            {user.role === 'buyer' && (
              <>
                <button 
                  className={`btn ${activeTab === 'custom-request' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveTab('custom-request')}
                >
                  <i className="fa-solid fa-wand-magic-sparkles"></i> Cerere Personalizată
                </button>
                <button 
                  className={`btn ${activeTab === 'my-orders' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveTab('my-orders')}
                >
                  <i className="fa-solid fa-clipboard-list"></i> Comenzile Mele
                </button>
              </>
            )}

            {/* Admin Links */}
            {user.role === 'admin' && (
              <button 
                className={`btn ${activeTab === 'admin' ? 'btn-accent-blue' : 'btn-secondary'}`}
                onClick={() => setActiveTab('admin')}
              >
                <i className="fa-solid fa-sliders"></i> Panou Admin
              </button>
            )}

            {/* Logout button */}
            <button className="btn btn-danger" onClick={() => setShowLogoutModal(true)} style={{ marginLeft: '10px' }}>
              <i className="fa-solid fa-right-from-bracket"></i> Logout ({user.role === 'admin' ? 'Admin' : user.name})
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="container flex-grow-1" style={{ paddingTop: '20px' }}>

        {/* 1. PUBLIC STANDARD CATALOG TAB */}
        {activeTab === 'catalog' && (
          <>
            <section className="hero">
              <h1 className="glow-text">Baza de Modele 3D Imprimabile</h1>
              <p>
                Răsfoiește modelele noastre pre-aprobate. Selectează modelul dorit, alege tipul de filament disponibil în stoc și plasează o comandă rapidă.
              </p>
            </section>

            {loading.models ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <i className="fa-solid fa-circle-notch spinner text-accent" style={{ fontSize: '40px' }}></i>
                <p style={{ marginTop: '15px', color: 'var(--text-secondary)' }}>Se încarcă catalogul...</p>
              </div>
            ) : (
              <div className="catalog-grid">
                {models.map(model => {
                  const defaultMat = materials.find(m => m.inStock) || materials[0];
                  const { total } = calculatePrice(model, defaultMat);
                  
                  return (
                    <div key={model.id} className="model-card glass">
                      <div className="model-img-wrapper">
                        <span className="model-category-badge">{model.category}</span>
                        {model.imageUrl ? (
                          <img src={model.imageUrl} alt={model.title} className="model-img" />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                            <i className="fa-solid fa-image-slash" style={{ fontSize: '32px' }}></i>
                          </div>
                        )}
                      </div>
                      
                      <div className="model-card-content">
                        <h3 className="model-card-title">{model.title}</h3>
                        <p className="model-card-desc">{model.description}</p>
                        
                        <div className="model-specs-row">
                          <span className="spec-item">
                            <i className="fa-solid fa-weight-hanging"></i> {model.weightGrams}g
                          </span>
                          <span className="spec-item">
                            <i className="fa-solid fa-clock"></i> {Math.floor(model.printTimeMinutes / 60)}h {model.printTimeMinutes % 60}m
                          </span>
                        </div>

                        <div className="model-card-footer">
                          <div className="price-indicator">
                            Preț estimativ
                            <span className="price-val">
                              {total > 0 ? `${total} RON` : 'N/A'}
                            </span>
                          </div>
                          <button 
                            className="btn btn-secondary btn-small"
                            onClick={() => openModelPreview(model)}
                          >
                            Vizualizare & Preț <i className="fa-solid fa-chevron-right"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* 2. BUYER: SUBMIT CUSTOM PRINTABLES REQUEST */}
        {activeTab === 'custom-request' && user.role === 'buyer' && (
          <div style={{ maxWidth: '800px', margin: '0 auto 60px auto' }}>
            <section className="hero" style={{ padding: '20px 0' }}>
              <h1 className="glow-text">Cerere Model Nou de pe Printables</h1>
              <p>
                Dacă ai găsit un model 3D pe Printables.com care nu este în catalogul nostru, adaugă link-ul lui aici. 
                Sistemul va prelua datele automat, iar noi îl vom revizui și îți vom comunica dacă îl putem printa!
              </p>
            </section>

            <form onSubmit={handleCustomRequestSubmit} className="glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="autocomplete-section" style={{ background: 'rgba(249, 115, 22, 0.03)', borderColor: 'rgba(249, 115, 22, 0.15)' }}>
                <label className="form-label" style={{ fontWeight: '700' }}>
                  <i className="fa-solid fa-link text-accent"></i> URL Model Printables.com
                </label>
                <div className="form-row">
                  <input 
                    type="text" 
                    className="form-input flex-grow-input"
                    style={{ paddingLeft: '12px' }}
                    placeholder="https://www.printables.com/model/123456-example-3d-model"
                    value={customRequestForm.printablesUrl}
                    onChange={e => setCustomRequestForm({ ...customRequestForm, printablesUrl: e.target.value })}
                    required
                  />
                  <button 
                    type="button" 
                    className="btn btn-primary"
                    disabled={loading.scrape}
                    onClick={handleScrapeCustom}
                  >
                    {loading.scrape ? <i className="fa-solid fa-circle-notch spinner"></i> : <i className="fa-solid fa-wand-magic-sparkles"></i>}
                    Preia Date
                  </button>
                </div>
              </div>

              {/* Scraped preview details */}
              {customRequestForm.title && (
                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '20px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <img src={customRequestForm.imageUrl} alt="" style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} />
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: '800' }}>{customRequestForm.title}</h4>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {customRequestForm.description}
                    </p>
                  </div>
                </div>
              )}

              <div className="settings-grid">
                <div className="form-group">
                  <label className="form-label">Titlu Model (Preluat automat)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    style={{ paddingLeft: '12px' }}
                    value={customRequestForm.title}
                    onChange={e => setCustomRequestForm({ ...customRequestForm, title: e.target.value })}
                    required
                    placeholder="Se completează automat după ce apeși pe Preia Date..."
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Alege Material & Culoare</label>
                  <select 
                    className="form-input"
                    style={{ paddingLeft: '12px' }}
                    value={customRequestForm.materialId}
                    onChange={e => setCustomRequestForm({ ...customRequestForm, materialId: e.target.value })}
                    required
                  >
                    {materials.filter(m => m.inStock).map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.texture}) - {m.pricePerGram.toFixed(2)} RON/g
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Greutate filament (Calculată automat)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    style={{ paddingLeft: '12px', background: 'var(--bg-tertiary)', cursor: 'not-allowed' }}
                    value={customRequestForm.weightGrams}
                    readOnly
                    required
                  />
                  <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    Această valoare este calculată automat pe baza fișierului 3D de pe Printables.
                  </small>
                </div>

                <div className="form-group">
                  <label className="form-label">Timp printare (Calculat automat)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    style={{ paddingLeft: '12px', background: 'var(--bg-tertiary)', cursor: 'not-allowed' }}
                    value={customRequestForm.printTimeMinutes}
                    readOnly
                    required
                  />
                  <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                    Timpul estimat este calculat automat pe baza geometriei modelului 3D.
                  </small>
                </div>
              </div>

              {/* Display calculated price */}
              {customRequestForm.materialId && (
                <div className="pricing-breakdown" style={{ marginBottom: 0 }}>
                  <div className="price-item-row total" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
                    <span>Preț Calculat Recomandat (RON):</span>
                    <span className="text-accent">
                      {calculatePrice(customRequestForm, materials.find(m => m.id === customRequestForm.materialId))?.total} RON
                    </span>
                  </div>
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ padding: '14px', justifyContent: 'center' }}>
                <i className="fa-solid fa-paper-plane"></i> Trimite Cererea Spre Revizuire
              </button>
            </form>
          </div>
        )}

        {/* 3. BUYER: MY PLACED REQUESTS & STATUSES */}
        {activeTab === 'my-orders' && user.role === 'buyer' && (
          <div style={{ maxWidth: '900px', margin: '0 auto 60px auto' }}>
            <h2 className="section-title">
              <i className="fa-solid fa-clipboard-list text-accent"></i> Istoricul Cererilor Mele
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Aici poți urmări statusul modelelor pe care le-ai trimis pentru imprimare. Administratorul va analiza cererile tale și va aproba sau respinge fabricarea lor.
            </p>

            {loading.orders ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <i className="fa-solid fa-circle-notch spinner text-accent" style={{ fontSize: '32px' }}></i>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {orders.filter(o => o.buyerName === user.name).map(order => {
                  const mat = materials.find(m => m.id === order.materialId);
                  return (
                    <div key={order.id} className="glass" style={{ padding: '20px', display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '20px', alignItems: 'center' }}>
                      {order.imageUrl ? (
                        <img src={order.imageUrl} alt="" style={{ width: '120px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} />
                      ) : (
                        <div style={{ width: '120px', height: '80px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', border: '1px solid var(--border)' }}>
                          <i className="fa-solid fa-cube text-muted" style={{ fontSize: '24px' }}></i>
                        </div>
                      )}
                      
                      <div>
                        <h4 style={{ fontSize: '17px', fontWeight: '800' }}>{order.title}</h4>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                          <span>Material: <strong>{mat ? mat.name : 'Nespecificat'}</strong></span>
                          <span>Greutate: {order.weightGrams}g</span>
                          <span>Timp estimat: {Math.floor(order.printTimeMinutes / 60)}h {order.printTimeMinutes % 60}m</span>
                        </div>
                        {order.printablesUrl && (
                          <a href={order.printablesUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', fontSize: '12px', color: 'var(--accent)', marginTop: '8px', textDecoration: 'none' }}>
                            <i className="fa-solid fa-external-link"></i> Vezi sursă Printables
                          </a>
                        )}
                      </div>

                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                        <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>{order.price.toFixed(2)} RON</span>
                        
                        <span className={`stock-badge ${
                          order.status === 'accepted' ? 'instock' : 
                          order.status === 'rejected' ? 'outofstock' : 
                          'pending'
                        }`} style={{ 
                          fontSize: '12px', 
                          padding: '6px 12px',
                          backgroundColor: order.status === 'pending' ? 'rgba(234, 179, 8, 0.15)' : '',
                          color: order.status === 'pending' ? '#f59e0b' : ''
                        }}>
                          {order.status === 'accepted' ? 'Acceptată / Se printează' : 
                           order.status === 'rejected' ? 'Respinsă' : 
                           'În Așteptare (Pending)'}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {orders.filter(o => o.buyerName === user.name).length === 0 && (
                  <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <i className="fa-solid fa-clipboard-question" style={{ fontSize: '40px', color: 'var(--text-muted)', marginBottom: '12px' }}></i>
                    <h3>Nu ai nicio cerere trimisă încă.</h3>
                    <p style={{ marginTop: '4px' }}>Mergi în tab-ul „Cerere Personalizată” pentru a trimite primul model de pe Printables.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 4. ADMIN DASHBOARD CONTROL PANEL */}
        {activeTab === 'admin' && user.role === 'admin' && (
          <div className="admin-layout">
            
            {/* Sidebar Navigation */}
            <aside className="admin-sidebar">
              <button 
                className={`sidebar-btn ${activeAdminTab === 'orders' ? 'active' : ''}`}
                onClick={() => setActiveAdminTab('orders')}
              >
                <i className="fa-solid fa-clipboard-list"></i> Comenzi Clienți
              </button>
              <button 
                className={`sidebar-btn ${activeAdminTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveAdminTab('settings')}
              >
                <i className="fa-solid fa-cogs"></i> Setări Imprimantă
              </button>
              <button 
                className={`sidebar-btn ${activeAdminTab === 'materials' ? 'active' : ''}`}
                onClick={() => setActiveAdminTab('materials')}
              >
                <i className="fa-solid fa-palette"></i> Inventar Filamente
              </button>
              <button 
                className={`sidebar-btn ${activeAdminTab === 'models' ? 'active' : ''}`}
                onClick={() => setActiveAdminTab('models')}
              >
                <i className="fa-solid fa-cubes"></i> Catalog Modele 3D
              </button>
            </aside>

            {/* Admin Action Viewport */}
            <section className="admin-content glass">
              
              {/* ADMIN TAB 1: CUSTOMER ORDERS (ACCEPT/REJECT & PRINT) */}
              {activeAdminTab === 'orders' && (
                <div>
                  <h2 className="section-title">
                    <i className="fa-solid fa-clipboard-list"></i> Revizuire Comenzi Clienți
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                    Revizuiți cererile de printare primite de la clienți. Acceptați comenzile realizabile și încărcați fișierul STL pentru a le deschide direct în Ultimaker Cura.
                  </p>

                  {loading.orders ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                      <i className="fa-solid fa-circle-notch spinner text-accent" style={{ fontSize: '32px' }}></i>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {orders.map(order => {
                        const mat = materials.find(m => m.id === order.materialId);
                        
                        return (
                          <div key={order.id} className="glass" style={{ padding: '20px', borderLeft: `4px solid ${
                            order.status === 'accepted' ? 'var(--accent-green)' : 
                            order.status === 'rejected' ? '#ef4444' : 
                            '#eab308'
                          }` }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr auto', gap: '20px', alignItems: 'start' }}>
                              
                              {order.imageUrl ? (
                                <img src={order.imageUrl} alt="" style={{ width: '100px', height: '70px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }} />
                              ) : (
                                <div style={{ width: '100px', height: '70px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                  <i className="fa-solid fa-cube text-muted"></i>
                                </div>
                              )}
                              
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <h4 style={{ fontSize: '17px', fontWeight: '800' }}>{order.title}</h4>
                                  <span style={{ fontSize: '11px', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                                    De la: <strong>{order.buyerName}</strong>
                                  </span>
                                </div>
                                
                                {order.status === 'pending' ? (
                                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Greutate:</span>
                                      <input 
                                        type="number" 
                                        key={`weight-${order.id}-${order.weightGrams}`}
                                        style={{ width: '65px', padding: '3px 6px', borderRadius: '4px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '12px' }}
                                        defaultValue={order.weightGrams}
                                        onBlur={e => {
                                          const val = parseFloat(e.target.value);
                                          if (val !== order.weightGrams) handleEditOrderSpecs(order.id, { weightGrams: val || 0 });
                                        }}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') {
                                            const val = parseFloat(e.target.value);
                                            if (val !== order.weightGrams) handleEditOrderSpecs(order.id, { weightGrams: val || 0 });
                                            e.target.blur();
                                          }
                                        }}
                                      />
                                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>g</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Timp:</span>
                                      <input 
                                        type="number" 
                                        key={`time-${order.id}-${order.printTimeMinutes}`}
                                        style={{ width: '70px', padding: '3px 6px', borderRadius: '4px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '12px' }}
                                        defaultValue={order.printTimeMinutes}
                                        onBlur={e => {
                                          const val = parseInt(e.target.value);
                                          if (val !== order.printTimeMinutes) handleEditOrderSpecs(order.id, { printTimeMinutes: val || 0 });
                                        }}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') {
                                            const val = parseInt(e.target.value);
                                            if (val !== order.printTimeMinutes) handleEditOrderSpecs(order.id, { printTimeMinutes: val || 0 });
                                            e.target.blur();
                                          }
                                        }}
                                      />
                                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>min</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Filament:</span>
                                      <select 
                                        style={{ padding: '3px 6px', borderRadius: '4px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '12px' }}
                                        value={order.materialId}
                                        onChange={e => handleEditOrderSpecs(order.id, { materialId: e.target.value })}
                                      >
                                        {materials.map(m => (
                                          <option key={m.id} value={m.id}>{m.name} ({m.texture})</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                                    <span>Filament: <span style={{ fontWeight: '600' }}>{mat ? mat.name : 'Nespecificat'}</span></span>
                                    <span>Specificații: {order.weightGrams}g, {Math.floor(order.printTimeMinutes / 60)}h {order.printTimeMinutes % 60}m</span>
                                  </div>
                                )}

                                {order.printablesUrl && (
                                  <a href={order.printablesUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', fontSize: '12px', color: 'var(--accent)', marginTop: '8px', textDecoration: 'none' }}>
                                    <i className="fa-solid fa-external-link"></i> Link Sursă Printables.com
                                  </a>
                                )}
                              </div>

                              <div style={{ textAlignment: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>{order.price.toFixed(2)} RON</span>
                                <span className={`stock-badge ${
                                  order.status === 'accepted' ? 'instock' : 
                                  order.status === 'rejected' ? 'outofstock' : 
                                  'pending'
                                }`} style={{ 
                                  backgroundColor: order.status === 'pending' ? 'rgba(234, 179, 8, 0.15)' : '',
                                  color: order.status === 'pending' ? '#f59e0b' : ''
                                }}>
                                  {order.status === 'accepted' ? 'Aprobată' : 
                                   order.status === 'rejected' ? 'Respinsă' : 
                                   'În Așteptare'}
                                </span>
                              </div>

                            </div>

                            {/* Actions and File Management */}
                            <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                              
                              {/* Left: Accept/Reject controls */}
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                {order.status === 'pending' ? (
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button 
                                      className="btn btn-primary btn-small"
                                      onClick={() => handleUpdateOrderStatus(order.id, 'accepted')}
                                      style={{ background: 'linear-gradient(135deg, var(--accent-green), #047857)', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)' }}
                                    >
                                      <i className="fa-solid fa-check"></i> Acceptă Comanda
                                    </button>
                                    <button 
                                      className="btn btn-danger btn-small"
                                      onClick={() => handleUpdateOrderStatus(order.id, 'rejected')}
                                    >
                                      <i className="fa-solid fa-xmark"></i> Respinge Comanda
                                    </button>
                                  </div>
                                ) : (
                                  <button 
                                    className="btn btn-secondary btn-small"
                                    onClick={() => handleUpdateOrderStatus(order.id, 'pending')}
                                  >
                                    Re-analizează Comanda (Pune în Așteptare)
                                  </button>
                                )}
                                
                                <button 
                                  className="btn btn-danger btn-small"
                                  onClick={() => handleDeleteOrder(order.id)}
                                  title="Șterge comanda definitiv"
                                  style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                >
                                  <i className="fa-solid fa-trash"></i> Șterge Comanda
                                </button>
                              </div>

                              {/* Right: File Upload and Cura Print integration */}
                              {order.status === 'accepted' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  {order.localPath ? (
                                    <>
                                      <span style={{ fontSize: '13px', color: '#6ee7b7', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <i className="fa-solid fa-file-circle-check"></i> {order.fileName || 'Fișier STL atașat'}
                                      </span>
                                      
                                      <button 
                                        className="btn btn-accent-blue btn-small"
                                        onClick={() => handlePrintOrderInCura(order.id)}
                                        disabled={loading.print === order.id}
                                      >
                                        {loading.print === order.id ? (
                                          <i className="fa-solid fa-circle-notch spinner"></i>
                                        ) : (
                                          <i className="fa-solid fa-print"></i>
                                        )}
                                        Deschide în Cura
                                      </button>
                                    </>
                                  ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ fontSize: '12px', color: '#f87171' }}>Lipsește fișierul 3D:</span>
                                      <button 
                                        className="btn btn-secondary btn-small"
                                        onClick={() => document.getElementById(`stl-order-file-${order.id}`).click()}
                                      >
                                        <i className="fa-solid fa-upload"></i> Încarcă STL
                                      </button>
                                      <input 
                                        type="file"
                                        id={`stl-order-file-${order.id}`}
                                        style={{ display: 'none' }}
                                        accept=".stl,.3mf"
                                        onChange={(e) => handleOrderFileUpload(e, order.id)}
                                      />
                                    </div>
                                  )}
                                </div>
                              )}

                            </div>
                          </div>
                        );
                      })}
                      {orders.length === 0 && (
                        <div className="glass" style={{ padding: '40px', textAlignment: 'center', color: 'var(--text-secondary)' }}>
                          Nu există comenzi de revizuit momentan.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ADMIN TAB 2: PRINTER CONFIGURATION */}
              {activeAdminTab === 'settings' && (
                <div>
                  <h2 className="section-title">
                    <i className="fa-solid fa-cogs"></i> Parametri Imprimare & Slicing
                  </h2>
                  <form onSubmit={saveSettings}>
                    <div className="settings-grid">
                      
                      <div className="form-group full-width">
                        <label className="form-label">Cale Ultimaker Cura Executable (Windows)</label>
                        <div className="form-row">
                          <div className="input-wrapper flex-grow-input">
                            <i className="fa-solid fa-folder-open input-icon"></i>
                            <input 
                              type="text" 
                              className="form-input" 
                              placeholder="C:\Program Files\UltiMaker Cura 5.8.0\Cura.exe"
                              value={settings.curaPath}
                              onChange={e => setSettings({ ...settings, curaPath: e.target.value })}
                            />
                          </div>
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            onClick={detectCura}
                          >
                            <i className="fa-solid fa-wand-magic-sparkles"></i> Detectează automat
                          </button>
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Adaos Comercial (%)</label>
                        <div className="input-wrapper">
                          <i className="fa-solid fa-percent input-icon"></i>
                          <input 
                            type="number" 
                            className="form-input" 
                            min="0"
                            value={settings.markupPercent}
                            onChange={e => setSettings({ ...settings, markupPercent: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Cost Energie Electrică / Oră (RON)</label>
                        <div className="input-wrapper">
                          <i className="fa-solid fa-bolt input-icon"></i>
                          <input 
                            type="number" 
                            step="0.05"
                            className="form-input" 
                            value={settings.electricityCostPerHour}
                            onChange={e => setSettings({ ...settings, electricityCostPerHour: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Rată Uzură & Întreținere / Oră (RON)</label>
                        <div className="input-wrapper">
                          <i className="fa-solid fa-screwdriver-wrench input-icon"></i>
                          <input 
                            type="number" 
                            step="0.05"
                            className="form-input" 
                            value={settings.hourlyRate}
                            onChange={e => setSettings({ ...settings, hourlyRate: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Taxă Fixă Pornire & Post-procesare (RON)</label>
                        <div className="input-wrapper">
                          <i className="fa-solid fa-coins input-icon"></i>
                          <input 
                            type="number" 
                            step="0.5"
                            className="form-input" 
                            value={settings.flatLaborFee}
                            onChange={e => setSettings({ ...settings, flatLaborFee: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                      </div>

                    </div>
                    
                    <div style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '20px', textAlign: 'right' }}>
                      <button type="submit" className="btn btn-primary">
                        <i className="fa-solid fa-floppy-disk"></i> Salvează Parametrii
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ADMIN TAB 3: INVENTORY MATERIALS */}
              {activeAdminTab === 'materials' && (
                <div>
                  <div className="flex-between" style={{ marginBottom: '20px' }}>
                    <h2 className="section-title" style={{ margin: 0 }}>
                      <i className="fa-solid fa-palette"></i> Inventar Filamente / Culori
                    </h2>
                    {editingMaterial && (
                      <button className="btn btn-secondary btn-small" onClick={resetMaterialForm}>
                        Anulează Editarea
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleMaterialSubmit} className="mb-20" style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <h3 style={{ fontSize: '15px', marginBottom: '15px', color: editingMaterial ? 'var(--accent)' : 'var(--text-primary)' }}>
                      {editingMaterial ? `Editează Filament: ${editingMaterial.name}` : 'Adaugă un Filament Nou'}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
                      
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Nume Filament</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ paddingLeft: '12px' }}
                          placeholder="ex. PLA Matte Black"
                          value={materialForm.name}
                          onChange={e => setMaterialForm({ ...materialForm, name: e.target.value })}
                          required
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Culoare Hex</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input 
                            type="color" 
                            style={{ width: '40px', height: '40px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                            value={materialForm.colorHex}
                            onChange={e => setMaterialForm({ ...materialForm, colorHex: e.target.value })}
                          />
                          <input 
                            type="text" 
                            className="form-input" 
                            style={{ paddingLeft: '12px', flexGrow: 1 }}
                            value={materialForm.colorHex}
                            onChange={e => setMaterialForm({ ...materialForm, colorHex: e.target.value })}
                            required
                          />
                        </div>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Textură</label>
                        <select 
                          className="form-input" 
                          style={{ paddingLeft: '12px' }}
                          value={materialForm.texture}
                          onChange={e => setMaterialForm({ ...materialForm, texture: e.target.value })}
                        >
                          <option value="Mat">Mat</option>
                          <option value="Lucios">Lucios</option>
                          <option value="Silk Lucios">Silk Lucios</option>
                          <option value="Translucid">Translucid</option>
                          <option value="Carbon / Special">Carbon / Special</option>
                        </select>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Preț per Gram (RON)</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          className="form-input"
                          style={{ paddingLeft: '12px' }}
                          value={materialForm.pricePerGram}
                          onChange={e => setMaterialForm({ ...materialForm, pricePerGram: parseFloat(e.target.value) || 0 })}
                          required
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Stoc (Grams)</label>
                        <input 
                          type="number" 
                          className="form-input"
                          style={{ paddingLeft: '12px' }}
                          value={materialForm.stockGrams}
                          onChange={e => setMaterialForm({ ...materialForm, stockGrams: parseInt(e.target.value) || 0 })}
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', paddingTop: '28px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                          <input 
                            type="checkbox" 
                            checked={materialForm.inStock}
                            onChange={e => setMaterialForm({ ...materialForm, inStock: e.target.checked })}
                          />
                          În Stoc / Disponibil
                        </label>
                      </div>

                    </div>
                    
                    <div style={{ marginTop: '16px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      {editingMaterial && (
                        <button type="button" className="btn btn-secondary btn-small" onClick={resetMaterialForm}>
                          Renunță
                        </button>
                      )}
                      <button type="submit" className="btn btn-primary btn-small">
                        <i className="fa-solid fa-check"></i> {editingMaterial ? 'Actualizează' : 'Adaugă Filament'}
                      </button>
                    </div>
                  </form>

                  <div className="inventory-table-container">
                    <table className="inventory-table">
                      <thead>
                        <tr>
                          <th>Filament</th>
                          <th>Culoare</th>
                          <th>Textură</th>
                          <th>Preț/Gram</th>
                          <th>Stoc curent</th>
                          <th>Status</th>
                          <th className="text-right">Acțiuni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {materials.map(mat => (
                          <tr key={mat.id}>
                            <td style={{ fontWeight: '700' }}>{mat.name}</td>
                            <td>
                              <span className="color-cell-circle" style={{ backgroundColor: mat.colorHex }}></span>
                              <code>{mat.colorHex}</code>
                            </td>
                            <td><span className="texture-tag">{mat.texture}</span></td>
                            <td>{mat.pricePerGram.toFixed(2)} RON</td>
                            <td>{mat.stockGrams}g</td>
                            <td>
                              <span className={`stock-badge ${mat.inStock ? 'instock' : 'outofstock'}`}>
                                {mat.inStock ? 'Disponibil' : 'Fără Stoc'}
                              </span>
                            </td>
                            <td className="text-right">
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary btn-small" onClick={() => startEditMaterial(mat)}>
                                  <i className="fa-solid fa-pen"></i>
                                </button>
                                <button className="btn btn-danger btn-small" onClick={() => deleteMaterial(mat.id)}>
                                  <i className="fa-solid fa-trash"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ADMIN TAB 4: CATALOG STANDARD MODELS */}
              {activeAdminTab === 'models' && (
                <div>
                  <div className="flex-between" style={{ marginBottom: '20px' }}>
                    <h2 className="section-title" style={{ margin: 0 }}>
                      <i className="fa-solid fa-cubes"></i> Gestionare Modele Catalog
                    </h2>
                    {editingModel && (
                      <button className="btn btn-secondary btn-small" onClick={resetModelForm}>
                        Anulează Editarea
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleModelSubmit} className="mb-20" style={{ padding: '20px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <h3 style={{ fontSize: '15px', marginBottom: '15px', color: editingModel ? 'var(--accent)' : 'var(--text-primary)' }}>
                      {editingModel ? `Editează Model: ${editingModel.title}` : 'Adaugă un Model în Catalog'}
                    </h3>

                    <div className="autocomplete-section">
                      <label className="form-label">
                        <i className="fa-solid fa-cloud-download text-accent"></i> Importă date automat de pe Printables.com
                      </label>
                      <div className="form-row">
                        <input 
                          type="text" 
                          className="form-input flex-grow-input"
                          style={{ paddingLeft: '12px' }}
                          placeholder="https://www.printables.com/model/..."
                          value={modelForm.printablesUrl}
                          onChange={e => setModelForm({ ...modelForm, printablesUrl: e.target.value })}
                        />
                        <button 
                          type="button" 
                          className="btn btn-accent-blue"
                          disabled={loading.scrape}
                          onClick={handleCatalogScrape}
                        >
                          {loading.scrape ? <i className="fa-solid fa-circle-notch spinner"></i> : <i className="fa-solid fa-wand-magic-sparkles"></i>}
                          Autofill
                        </button>
                      </div>
                    </div>

                    <div className="settings-grid">
                      <div className="form-group">
                        <label className="form-label">Titlu Model</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ paddingLeft: '12px' }}
                          value={modelForm.title}
                          onChange={e => setModelForm({ ...modelForm, title: e.target.value })}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Categorie</label>
                        <select 
                          className="form-input"
                          style={{ paddingLeft: '12px' }}
                          value={modelForm.category}
                          onChange={e => setModelForm({ ...modelForm, category: e.target.value })}
                        >
                          <option value="Jucării & Articulate">Jucării & Articulate</option>
                          <option value="Calibrare & Utile">Calibrare & Utile</option>
                          <option value="Accesorii Birou">Accesorii Birou</option>
                          <option value="Decoratiuni & Arta">Decoratiuni & Arta</option>
                          <option value="Gadgets & Tech">Gadgets & Tech</option>
                          <option value="Altele">Altele</option>
                        </select>
                      </div>

                      <div className="form-group full-width">
                        <label className="form-label">Descriere</label>
                        <textarea 
                          className="form-textarea"
                          value={modelForm.description}
                          onChange={e => setModelForm({ ...modelForm, description: e.target.value })}
                        />
                      </div>

                      <div className="form-group full-width">
                        <label className="form-label">URL Imagine Copertă</label>
                        <input 
                          type="text" 
                          className="form-input"
                          style={{ paddingLeft: '12px' }}
                          value={modelForm.imageUrl}
                          onChange={e => setModelForm({ ...modelForm, imageUrl: e.target.value })}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Greutate filament (Grams)</label>
                        <input 
                          type="number" 
                          className="form-input"
                          style={{ paddingLeft: '12px' }}
                          value={modelForm.weightGrams}
                          onChange={e => setModelForm({ ...modelForm, weightGrams: parseFloat(e.target.value) || 0 })}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Timp de printare (Minute)</label>
                        <input 
                          type="number" 
                          className="form-input"
                          style={{ paddingLeft: '12px' }}
                          value={modelForm.printTimeMinutes}
                          onChange={e => setModelForm({ ...modelForm, printTimeMinutes: parseInt(e.target.value) || 0 })}
                          required
                        />
                      </div>

                      <div className="form-group full-width">
                        <label className="form-label">Încărcare fișier 3D (.stl / .3mf)</label>
                        <div className="upload-dropzone" onClick={() => document.getElementById('stl-catalog-picker').click()}>
                          <input 
                            type="file" 
                            id="stl-catalog-picker" 
                            style={{ display: 'none' }} 
                            accept=".stl,.3mf"
                            onChange={handleCatalogFileUpload}
                          />
                          <i className="fa-solid fa-file-arrow-up upload-icon"></i>
                          <p style={{ fontSize: '13px', fontWeight: '600' }}>Click pentru încărcare fișier 3D</p>
                        </div>
                        {modelForm.localPath && (
                          <div className="uploaded-file-banner">
                            <div>
                              <i className="fa-solid fa-check"></i> Fișier: <strong>{modelForm.fileName || modelForm.localPath}</strong>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button type="submit" className="btn btn-primary" disabled={loading.upload}>
                        Salvează Model Catalog
                      </button>
                    </div>
                  </form>

                  <div className="inventory-table-container">
                    <table className="inventory-table">
                      <thead>
                        <tr>
                          <th>Copertă</th>
                          <th>Model</th>
                          <th>Greutate & Timp</th>
                          <th>Cura Local</th>
                          <th className="text-right">Acțiuni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {models.map(model => (
                          <tr key={model.id}>
                            <td>
                              <img src={model.imageUrl} alt="" style={{ width: '50px', height: '35px', objectFit: 'cover', borderRadius: '4px' }} />
                            </td>
                            <td>
                              <span style={{ fontWeight: '700' }}>{model.title}</span>
                            </td>
                            <td>{model.weightGrams}g / {Math.floor(model.printTimeMinutes / 60)}h {model.printTimeMinutes % 60}m</td>
                            <td>
                              {model.localPath ? (
                                <button 
                                  className="btn btn-accent-blue btn-small"
                                  onClick={() => handlePrintModelInCura(model.id)}
                                  disabled={loading.printModel === model.id}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                >
                                  {loading.printModel === model.id ? (
                                    <i className="fa-solid fa-circle-notch spinner"></i>
                                  ) : (
                                    <>
                                      <i className="fa-solid fa-print"></i> Cura
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>Fără fișier</span>
                              )}
                            </td>
                            <td className="text-right">
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary btn-small" onClick={() => startEditModel(model)}>
                                  <i className="fa-solid fa-pen"></i>
                                </button>
                                <button className="btn btn-danger btn-small" onClick={() => deleteModel(model.id)}>
                                  <i className="fa-solid fa-trash"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </section>
          </div>
        )}

      </main>

      {/* DETAIL MODAL PREVIEW (For Buyer placing Catalog order) */}
      {selectedModel && (
        <div className="modal-overlay" onClick={() => setSelectedModel(null)}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()}>
            <div className="modal-header-row">
              <span style={{ fontSize: '13px', textTransform: 'uppercase', fontWeight: '800', color: 'var(--accent)' }}>
                {selectedModel.category}
              </span>
              <button className="modal-close" onClick={() => setSelectedModel(null)}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            
            <div className="modal-body">
              <div className="model-detail-grid">
                
                <div>
                  <div className="detail-img-box">
                    <img src={selectedModel.imageUrl} alt={selectedModel.title} />
                  </div>
                  <div className="detail-meta-list" style={{ marginTop: '20px' }}>
                    <div className="meta-box">Greutate: <span>{selectedModel.weightGrams}g</span></div>
                    <div className="meta-box">Timp printare: <span>{Math.floor(selectedModel.printTimeMinutes / 60)}h {selectedModel.printTimeMinutes % 60}m</span></div>
                  </div>
                </div>

                <div className="detail-info">
                  <h2 className="detail-title">{selectedModel.title}</h2>
                  <p className="detail-desc">{selectedModel.description}</p>
                  
                  <div className="color-selector-section">
                    <span className="selector-label">Alege Filament & Culoare:</span>
                    <div className="colors-grid">
                      {materials.filter(m => m.inStock).map(mat => (
                        <button 
                          key={mat.id}
                          className={`color-swatch-btn ${selectedMaterial?.id === mat.id ? 'selected' : ''}`}
                          onClick={() => setSelectedMaterial(mat)}
                        >
                          <span className="swatch-circle" style={{ backgroundColor: mat.colorHex }}></span>
                          <div>
                            <div style={{ fontWeight: '700' }}>{mat.name}</div>
                            <span className="texture-tag">{mat.texture}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedMaterial && (
                    <div className="pricing-breakdown">
                      <div className="price-item-row total" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
                        <span>Cost Total Printare (RON):</span>
                        <span className="text-accent">{calculatePrice(selectedModel, selectedMaterial).total} RON</span>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                    <button 
                      className="btn btn-primary"
                      style={{ width: '100%', padding: '14px', justifyContent: 'center' }}
                      disabled={!selectedMaterial}
                      onClick={handleOrderCatalogModel}
                    >
                      <i className="fa-solid fa-cart-shopping"></i> Trimite Comanda de Printare
                    </button>
                  </div>

                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="modal-overlay" onClick={() => setShowLogoutModal(false)}>
          <div className="modal-content glass" style={{ maxWidth: '400px', textAlign: 'center', padding: '30px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '20px', marginBottom: '15px', color: 'var(--text-primary)' }}>Confirm Logout</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>
              Are you sure you want to log out from the portal?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button 
                className="btn btn-danger" 
                style={{ justifyContent: 'center', padding: '12px' }}
                onClick={() => { handleLogout(); setShowLogoutModal(false); }}
              >
                Deconectare
              </button>
              <button 
                className="btn btn-secondary" 
                style={{ justifyContent: 'center', padding: '12px' }}
                onClick={() => setShowLogoutModal(false)}
              >
                Closed
              </button>
              <button 
                className="btn btn-secondary" 
                style={{ justifyContent: 'center', padding: '12px', border: 'none', background: 'transparent' }}
                onClick={() => setShowLogoutModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ marginTop: '60px', padding: '30px 0', borderTop: '1px solid var(--border)', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
        <div className="container">
          <p>© 2026 Printables Cura Hub. Creat pentru servicii locale de printare 3D direct prin Ultimaker Cura.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
