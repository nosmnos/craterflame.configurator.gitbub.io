import { init, loadModel, updateTexture, setMode, resize, setFinish } from './configurator.js';

// State
const state = {
    model: 'radiant',
    size: 's-740',
    basePrice: 3500,
    customizationFee: 0,
    cart: []
};

// Prices
const PRICES = {
    'radiant': { 's-740': 3500, 'xl-1000': 4625 },
    'bloom': { 's-740': 3500, 'xl-1000': 4625 }
};
const CUSTOMIZATION_COST = 350;

// Elements
const ui = {
    modelSelect: document.getElementById('model-select'),
    sizeSelect: document.getElementById('size-select'),
    modeBtns: document.querySelectorAll('.mode-btn'),
    textInput: document.getElementById('custom-text'),
    imageInput: document.getElementById('custom-image'),
    basePriceDisplay: document.getElementById('base-price'),
    customFeeRow: document.getElementById('customization-fee-row'),
    totalPriceDisplay: document.getElementById('total-price'),
    addToCartBtn: document.getElementById('add-to-cart'),
    cartToggle: document.getElementById('cart-toggle'),
    cartSidebar: document.getElementById('cart-sidebar'),
    closeCart: document.getElementById('close-cart'),
    cartCount: document.getElementById('cart-count'),
    cartTotal: document.getElementById('cart-total'),
    cartItemsContainer: document.getElementById('cart-items-container'),
    resetViewBtn: document.getElementById('reset-view'),
    resetViewBtn: document.getElementById('reset-view'),
    textureCanvas: document.getElementById('texture-canvas'),
    finishSelect: document.getElementById('finish-select')
};

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    // Init Three.js
    await init('threejs-container');

    // Load initial model
    loadModel(state.model);

    // Setup Event Listeners
    setupEventListeners();

    // Update Price
    // Update Price
    updatePrice();

    // Set initial finish
    if (ui.finishSelect) setFinish(ui.finishSelect.value);
});

function setupEventListeners() {
    // Model Change
    ui.modelSelect.addEventListener('change', (e) => {
        state.model = e.target.value;
        loadModel(state.model);
        updatePrice();
    });

    // Size Change
    ui.sizeSelect.addEventListener('change', (e) => {
        state.size = e.target.value;
        updatePrice();
    });

    // Mode Switch
    ui.modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            ui.modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.dataset.mode;
            setMode(mode);
            triggerTextureUpdate(); // Re-apply texture logic if needed
        });
    });

    // Finish Selection
    if (ui.finishSelect) {
        ui.finishSelect.addEventListener('change', (e) => {
            setFinish(e.target.value);
            // Re-trigger model check logic just in case default model load needs this
        });
    }

    // Text Input
    ui.textInput.addEventListener('input', () => {
        triggerTextureUpdate();
        checkCustomizationFee();
    });

    // Reset Customization
    const resetBtn = document.getElementById('reset-customization');
    resetBtn.addEventListener('click', () => {
        ui.textInput.value = '';
        ui.imageInput.value = '';
        currentUploadedImage = null; // Clear image var
        triggerTextureUpdate(); // Will fallback to clear canvas
        checkCustomizationFee();
    });

    // Image Upload
    ui.imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                alert('File size exceeds 5MB');
                ui.imageInput.value = ''; // Reset
                return;
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    // Store image in state or directly on canvas wrapper
                    // We'll pass the image object to the texture generator
                    triggerTextureUpdate(img);
                    checkCustomizationFee();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    // UI Buttons
    ui.cartToggle.addEventListener('click', toggleCart);
    ui.closeCart.addEventListener('click', toggleCart);
    ui.addToCartBtn.addEventListener('click', addToCart);
    ui.resetViewBtn.addEventListener('click', () => {
        // We might need to expose camera reset from configurator
        // For now, let's assume we can re-init or have a specific function
        // Implemented simply as reloading the model's camera target or similar? 
        // Or just let configurator handle it via a custom event or exported function.
        // I'll export a simple resetCamera function in configurator.js later.
        // For now, assume it exists or just log.
        import('./configurator.js').then(module => {
            if (module.resetCamera) module.resetCamera();
        });
    });

    window.addEventListener('resize', resize);
}

// Logic
function updatePrice() {
    const base = PRICES[state.model][state.size];
    state.basePrice = base;

    let total = base + state.customizationFee;

    ui.basePriceDisplay.textContent = `€${base.toLocaleString()}`;
    ui.totalPriceDisplay.textContent = `€${total.toLocaleString()}`;
}

function checkCustomizationFee() {
    const hasText = ui.textInput.value.trim().length > 0;
    const hasImage = ui.imageInput.files.length > 0; // Note: if user cancels file dialog, files is empty. But if we use currentUploadedImage it's safer.
    // Actually currentUploadedImage persists until reset.
    // ui.imageInput.files is what controls the file input visual.
    // Let's rely on the inputs being present OR currentUploadedImage being not null?
    // User might clear text but keep image.

    // Better:
    const isCustomized = hasText || currentUploadedImage;

    const resetBtn = document.getElementById('reset-customization');

    if (isCustomized) {
        state.customizationFee = CUSTOMIZATION_COST;
        ui.customFeeRow.style.display = 'flex';
        resetBtn.style.display = 'block'; // Show reset button
    } else {
        state.customizationFee = 0;
        ui.customFeeRow.style.display = 'none';
        resetBtn.style.display = 'none'; // Hide reset button
    }
    updatePrice();
}

// Texture Generation
let currentUploadedImage = null;

function triggerTextureUpdate(newImage = null) {
    if (newImage) currentUploadedImage = newImage;
    // If we call with NO arguments and currentUploadedImage is NULL (reset), then we just clear.
    // If we call with NO arguments but currentUploadedImage exists (text update), we re-use.
    // To explicitly clear image, we need to set it null before calling.

    const ctx = ui.textureCanvas.getContext('2d');
    const width = ui.textureCanvas.width;
    const height = ui.textureCanvas.height;

    // Clear
    // "Printed" implies we might want a background color if it covers the whole panel?
    // Or transparent? 
    // "Albedo / baseColor map" -> If transparent, the original material color shows through?
    // Usually for decals, we want transparency.
    ctx.clearRect(0, 0, width, height);

    // If "Printed", maybe we want a white base IF it replaces the whole texture?
    // But requirement says "Fixed position on panel", "Cannot be applied to other surfaces".
    // This implies it's a decal.
    // However, for "Printed Mode: .. Implemented using: Albedo / baseColor map".
    // If we replace the albedo map of the metal, we need the metal color too.
    // Or we use a decal mesh.
    // "Apply texture ONLY to front panel mesh".
    // If we replace the front panel's map, we need to draw the panel's base color (if it has a texture) or just the custom graphics if we are using a layered approach or alpha test.
    // Let's assume the front panel is a solid color metal.
    // I will fill with transparent (so it doesn't affect base) IF I can use an alpha map or if the material supports transparency.
    // But standard metal doesn't use alpha for transparency usually, it's opaque.
    // Strategy:
    // 1. If we are replacing the `map` (albedo), we need to fill the canvas with the base color of the metal if we can't use transparency.
    // OR we use the `map` property which sits ON TOP of color? No, `map` multiplies with `color`.
    // If the mesh currently has no map, and we add one, the transparent parts of the map (alpha 0) will show black if `transparent: false`.
    // If `transparent: true`, the object becomes transparent. We don't want a transparent metal panel.
    // Solution:
    // We should probably use a DECAL approach or modify the map to include the base color.
    // Since I don't have the original texture of the metal (it's likely just a material color), I should assume a color.
    // BUT, the prompt says "Neutral dark environment", "Product-focused".
    // Let's assume I can write the text/image on a transparent canvas and use it as a `map` but I need to handle the background.
    // Better approach for single mesh panel: 
    // Use `CanvasTexture` as `map`.
    // Fill canvas with the hex color of the panel (approximated) OR white if the map is multiplied.
    // Actually, if I provide a map, Three.js uses it. 
    // If I want the metal look, I should probably NOT change the material type, just the map.
    // I will try to keep the canvas transparent and see if Three.js handles it (it might show black).
    // Safest bet: Draw the customization on top of a fill color that matches the object, OR use a separate decal mesh. 
    // "Inputs: Image upload... Rules: Fixed position on panel... Cannot be applied to other surfaces".
    // "Apply texture ONLY to front panel mesh".
    // I will try using the canvas as the `map` with the correct metal color background.

    // For now, let's just draw the text/image centralized.

    // Draw Text
    const text = ui.textInput.value;
    if (text) {
        ctx.fillStyle = '#FFFFFF'; // "Primary text color: #FFFFFF"
        ctx.font = 'bold 100px Anta'; // Big font for high res texture
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Center of texture
        ctx.fillText(text, width / 2, height / 2);
    }

    // Draw Image
    if (currentUploadedImage) {
        // Draw centered, verify max size (maintain aspect ratio)
        // Let's constrain to 50% of the panel width/height
        const maxDim = 512;
        const scale = Math.min(maxDim / currentUploadedImage.width, maxDim / currentUploadedImage.height);
        const w = currentUploadedImage.width * scale;
        const h = currentUploadedImage.height * scale;

        ctx.drawImage(currentUploadedImage, (width - w) / 2, (height - h) / 2, w, h);
    }

    updateTexture(ui.textureCanvas);
}

// Cart
function addToCart() {
    // Check if item with same config exists
    const existingItem = state.cart.find(item =>
        item.model === state.model &&
        item.size === state.size &&
        item.text === ui.textInput.value &&
        item.hasCustomization === (state.customizationFee > 0)
    );

    if (existingItem) {
        existingItem.qty++;
    } else {
        const item = {
            model: state.model,
            size: state.size,
            price: state.basePrice + state.customizationFee,
            hasCustomization: state.customizationFee > 0,
            text: ui.textInput.value,
            // We can also store image name if needed, but we don't handle persisting image binary deep logic here yet
            qty: 1,
            id: Date.now()
        };
        state.cart.push(item);
    }

    renderCart();
    // Only open if it's new or user clicked add, but function is called by button so yes
    if (!ui.cartSidebar.classList.contains('open')) toggleCart();
}

function renderCart() {
    ui.cartItemsContainer.innerHTML = '';
    let subtotal = 0;

    state.cart.forEach((item, index) => {
        subtotal += item.price * item.qty;

        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div class="cart-item-header">
                <strong>${item.model === 'radiant' ? 'Meteorite Radiant' : 'Meteorite Bloom'}</strong>
                <span>€${(item.price * item.qty).toLocaleString()}</span>
            </div>
            <div class="cart-item-details">
                Size: ${item.size.toUpperCase()}<br>
                ${item.hasCustomization ? '<span style="color:var(--color-accent);">+ Customization</span><br>' : ''}
                ${item.text ? `Text: "${item.text}"` : ''}
            </div>
            <div class="cart-item-controls">
                <div class="qty-controls">
                    <button class="qty-btn" onclick="window.updateQty(${index}, -1)">-</button>
                    <span>${item.qty}</span>
                    <button class="qty-btn" onclick="window.updateQty(${index}, 1)">+</button>
                </div>
                <button class="remove-btn" onclick="window.removeItem(${index})" title="Remove">
                    <svg viewBox="0 0 24 24" width="20" height="20">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                </button>
            </div>
        `;
        ui.cartItemsContainer.appendChild(div);
    });

    const count = state.cart.reduce((welcome, item) => welcome + item.qty, 0);

    ui.cartTotal.textContent = `€${subtotal.toLocaleString()}`;
    ui.cartCount.textContent = count;
    ui.cartCount.style.display = count > 0 ? 'flex' : 'none';
}

window.updateQty = (index, delta) => {
    const item = state.cart[index];
    item.qty += delta;
    if (item.qty < 1) item.qty = 1; // Don't remove on minus, require trash click? Or remove at 0? Standard is usually stay at 1.
    renderCart();
};

window.removeItem = (index) => {
    state.cart.splice(index, 1);
    renderCart();
}; // Keeping this consistent

function toggleCart() {
    ui.cartSidebar.classList.toggle('open');
}

