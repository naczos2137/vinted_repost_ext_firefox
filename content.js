// Content script for Vinted Reposter & Downloader

const LOG_PREFIX = "[VintedExt]";

const SELECTORS = {
  itemTitle: 'h1[itemprop="name"], [data-testid="item-title"], .item-description__title, h1.details-list__item-value, h1',
  itemDescription: 'div[itemprop="description"], [itemprop="description"], .item-description__content',
  itemPrice: 'h2[itemprop="price"], [data-testid="item-price"], .item-description__price',
  actionButtons: 'button[data-testid="item-buy-button"], button[data-testid="item-edit-button"], .c-button--primary',
  sidebar: '.item-description__details, [data-testid="item-sidebar"], .item-seller-info, .sidebar-section',
  uploadTitle: 'input[name="title"], [data-testid="upload-form-title"] input',
  uploadDescription: 'textarea[name="description"], [data-testid="upload-form-description"] textarea',
  uploadPrice: 'input[name="price"], [data-testid="upload-form-price"] input',
};

// --- Utilities ---

function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){ u8arr[n] = bstr.charCodeAt(n); }
    return new Blob([u8arr], {type:mime});
}

// Fetch image via background to bypass CORS, then de-hash via Canvas
async function processImageToBlob(url) {
  try {
    const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "fetch_image_as_base64", url: url }, resolve);
    });
    if (response.error || !response.base64) throw new Error(response.error);

    const blob = dataURLtoBlob(response.base64);
    const img = await createImageBitmap(blob);
    
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  } catch (e) {
    console.error(LOG_PREFIX, "Erreur traitement image", url, e);
    return null;
  }
}

// Ultimate logic to find High-Res images
function getHighResImagesUrls() {
  const images = new Set();
  
  // 1. Preloads (Most reliable on initial load)
  Array.from(document.querySelectorAll('link[rel="preload"][as="image"]'))
       .filter(l => l.href.includes('/f800/')).forEach(l => images.add(l.href));

  // 2. React State
  const stateScript = document.querySelector('script[data-name="item-container"], script[data-component-name="ItemView"]');
  if (stateScript) {
    try {
      const state = JSON.parse(stateScript.innerText);
      state.item?.photos?.map(p => p.full_size_url || p.url).forEach(p => p && images.add(p));
    } catch (e) {}
  }

  // 3. Brute force HTML
  if (images.size === 0) {
    const html = document.documentElement.innerHTML;
    const matches = html.match(/https:\/\/images[0-9]*\.vinted\.net\/[a-zA-Z0-9_\-\/]+\.webp[^"'\s\\]*/g) || [];
    matches.map(url => url.replace(/\\u0026/g, '&').replace(/\\/g, ''))
           .filter(url => url.includes('/f800/'))
           .forEach(url => images.add(url));
  }
  return Array.from(images);
}

// Logic to extract Text Data
function scrapeTextData() {
  const urlParts = window.location.pathname.split('/');
  const slug = urlParts[urlParts.length - 1] || "";
  let titleFromUrl = "Annonce";
  if (slug.includes('-')) titleFromUrl = slug.split('-').slice(1).join(' ');

  let data = {
    originalUrl: window.location.href,
    title: document.querySelector(SELECTORS.itemTitle)?.innerText.trim() || titleFromUrl,
    description: document.querySelector(SELECTORS.itemDescription)?.innerText.trim() || "",
    price: document.querySelector(SELECTORS.itemPrice)?.innerText.trim().replace(/[^0-9,.]/g, '').replace(',', '.') || ""
  };

  const stateScript = document.querySelector('script[data-name="item-container"], script[data-component-name="ItemView"]');
  if (stateScript) {
    try {
      const state = JSON.parse(stateScript.innerText);
      data.title = state.item?.title || data.title;
      data.description = state.item?.description || data.description;
      data.price = state.item?.price?.amount || data.price;
    } catch (e) {}
  }
  return data;
}

// --- Injection UI (Item Page) ---

function injectMainUI() {
  if (document.getElementById('vinted-ext-container')) return;
  const target = document.querySelector(SELECTORS.actionButtons) || document.querySelector(SELECTORS.sidebar);
  if (!target) return;

  const container = document.createElement('div');
  container.id = 'vinted-ext-container';
  container.style.cssText = "margin: 15px 0; padding: 15px; border: 3px solid #007782; border-radius: 8px; background: #f8ffff; display: flex; flex-direction: column; gap: 10px;";
  
  const title = document.createElement('div');
  title.innerText = "⚡ Vinted Extension";
  title.style.cssText = "font-weight: bold; color: #007782; font-size: 16px; margin-bottom: 5px; text-align: center;";
  container.appendChild(title);

  // Button 1: Download Images Only
  const btnDownload = document.createElement('button');
  btnDownload.innerText = '📸 1. Télécharger Images (Anti-Doublon)';
  btnDownload.style.cssText = "background:#5bc0de; color:white; border:none; padding:12px; cursor:pointer; border-radius:4px; font-weight:bold; font-size: 14px;";
  
  btnDownload.onclick = async () => {
    const rawUrls = getHighResImagesUrls();
    if (rawUrls.length === 0) return alert("Aucune image trouvée.");
    
    btnDownload.disabled = true;
    const safeTitle = scrapeTextData().title.replace(/[^a-zA-Z0-9À-ÿ]/g, '_').substring(0, 40);
    
    for (let i = 0; i < rawUrls.length; i++) {
      btnDownload.innerText = `⏳ Traitement (${i+1}/${rawUrls.length})...`;
      const blob = await processImageToBlob(rawUrls[i]);
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = objectUrl; a.download = `Vinted_${safeTitle}_photo_${i+1}.jpg`;
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(objectUrl); }, 1000);
        await new Promise(r => setTimeout(r, 600));
      }
    }
    btnDownload.innerText = "✅ Images téléchargées !";
    setTimeout(() => { btnDownload.disabled = false; btnDownload.innerText = '📸 1. Télécharger Images (Anti-Doublon)'; }, 3000);
  };

  // Button 2: Repost Text
  const btnRepost = document.createElement('button');
  btnRepost.innerText = '♻️ 2. Reposter le texte';
  btnRepost.style.cssText = "background:#007782; color:white; border:none; padding:12px; cursor:pointer; border-radius:4px; font-weight:bold; font-size: 14px;";
  
  btnRepost.onclick = () => {
    try {
      btnRepost.disabled = true;
      btnRepost.innerText = 'Patientez...';
      const data = scrapeTextData();
      console.log(LOG_PREFIX, "Sending repost data:", data);
      chrome.runtime.sendMessage({ action: "repost_start", data: data }, (response) => {
          if (chrome.runtime.lastError) {
              console.error(LOG_PREFIX, "Error sending message:", chrome.runtime.lastError);
              btnRepost.innerText = "❌ Erreur de communication";
              setTimeout(() => { btnRepost.disabled = false; btnRepost.innerText = '♻️ 2. Reposter le texte'; }, 3000);
          }
      });
    } catch (err) {
      console.error(LOG_PREFIX, "Error during scrapeTextData:", err);
      btnRepost.innerText = "❌ Erreur interne";
      setTimeout(() => { btnRepost.disabled = false; btnRepost.innerText = '♻️ 2. Reposter le texte'; }, 3000);
    }
  };

  container.appendChild(btnDownload);
  container.appendChild(btnRepost);
  target.parentNode.insertBefore(container, target.nextSibling);
}

// --- Auto-fill UI (Upload Page) ---

async function autoFillText() {
  const result = await chrome.storage.local.get('repostData');
  if (!result.repostData) return;
  if (document.getElementById('vinted-repost-overlay')) return;
  const data = result.repostData;

  const overlay = document.createElement('div');
  overlay.id = "vinted-repost-overlay";
  overlay.style.cssText = "position:fixed; top:20px; right:20px; z-index:10000; background:white; border:3px solid #007782; padding:20px; border-radius:12px; width:320px; box-shadow:0 10px 25px rgba(0,0,0,0.3); font-family: sans-serif;";
  overlay.innerHTML = `
    <h3 style="margin:0 0 10px 0; color:#007782;">⚡ Vinted Extension</h3>
    <div style="font-size:12px; margin-bottom:15px;"><b>Titre :</b> ${data.title}</div>
    <div style="font-size:13px; margin-bottom:15px; color:green; font-weight:bold;">✅ Le texte a été rempli.</div>
    <div style="font-size:12px; margin-bottom:15px; color:#444;">Veuillez glisser vos images téléchargées dans la zone prévue par Vinted.</div>
    <button id="vinted-finish-repost" style="width:100%; padding:10px; background:#007782; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">Terminer & Effacer la mémoire</button>
  `;
  document.body.appendChild(overlay);

  document.getElementById('vinted-finish-repost').onclick = () => {
    chrome.storage.local.remove('repostData');
    overlay.remove();
  };

  // Perform text fill
  const fill = () => {
    const t = document.querySelector(SELECTORS.uploadTitle); if (t) { t.value = data.title; t.dispatchEvent(new Event('input', { bubbles: true })); }
    const d = document.querySelector(SELECTORS.uploadDescription); if (d) { d.value = data.description; d.dispatchEvent(new Event('input', { bubbles: true })); }
    const p = document.querySelector(SELECTORS.uploadPrice); if (p) { p.value = data.price; p.dispatchEvent(new Event('input', { bubbles: true })); }
  };
  
  fill();
  // Vinted's React can be slow, fill again after a moment just in case
  setTimeout(fill, 1000);
}

// --- Init ---

function run() {
  if (window.location.href.includes('/items/new')) {
    setTimeout(autoFillText, 1500);
  } else if (window.location.href.includes('/items/')) {
    setInterval(injectMainUI, 2000);
  }
}

run();
