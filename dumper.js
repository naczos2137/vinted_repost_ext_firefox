// Temporary script to dump Vinted DOM

(() => {
  const LOG_PREFIX_DUMPER = "[VintedDumper]";

  function injectDumpButton() {
    if (document.getElementById('vinted-dump-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'vinted-dump-btn';
    btn.innerText = 'DUMP DOM';
    btn.style.cssText = "position:fixed; bottom:20px; left:20px; z-index:99999; background:red; color:white; padding:10px;";
    
    btn.onclick = () => {
      btn.innerText = 'DUMPING...';
      
      try {
        const html = document.documentElement.outerHTML;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vinted_dump.html';
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          btn.innerText = 'DUMP OK !';
          btn.style.background = 'green';
        }, 100);
      } catch (err) {
        console.error(LOG_PREFIX_DUMPER, err);
        btn.innerText = 'ERREUR';
      }
    };
    
    document.body.appendChild(btn);
  }

  setInterval(injectDumpButton, 2000);
})();
