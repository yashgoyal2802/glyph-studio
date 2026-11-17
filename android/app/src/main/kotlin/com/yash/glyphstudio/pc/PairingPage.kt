package com.yash.glyphstudio.pc

/** The only page an unpaired browser sees: a field for the 6-digit code. It is self-contained (no external files). */
object PairingPage {
    val HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Glyph Studio</title>
<style>
:root{color-scheme:dark light;--bg:#0c0c0e;--text:#f2f2f2;--muted:#9a9aa2;--line:#2a2a30;--accent:#ff3b30}
@media (prefers-color-scheme:light){:root{--bg:#f6f6f4;--text:#16161a;--muted:#62626a;--line:#d8d8d4}}
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:16px system-ui,sans-serif}
main{width:min(22rem,calc(100% - 2rem));display:grid;gap:.9rem}
h1{font-size:1.3rem;margin:0}p{margin:0;color:var(--muted)}
input{font:inherit;font-size:1.8rem;letter-spacing:.4em;text-align:center;padding:.6rem;border-radius:14px;border:1px solid var(--line);background:transparent;color:var(--text);min-height:56px;width:100%;box-sizing:border-box}
button{font:inherit;min-height:48px;border-radius:14px;border:0;background:var(--text);color:var(--bg);font-weight:600;cursor:pointer}
#err{color:var(--accent);min-height:1.3em}
</style></head><body><main>
<h1>Glyph Studio</h1>
<p>Enter the 6-digit code shown on your phone to edit your designs from this computer.</p>
<form id="f"><input id="c" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" autofocus aria-label="Pairing code"></form>
<button id="b" form="f">Connect</button>
<p id="err" role="alert"></p>
<script>
const f=document.getElementById('f'),c=document.getElementById('c'),err=document.getElementById('err');
f.addEventListener('submit',async e=>{e.preventDefault();err.textContent='';
 try{const r=await fetch('/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:c.value})});
  if(r.ok){location.replace('/');return}
  const j=await r.json().catch(()=>({}));
  err.textContent=(j.error||'Could not connect.')+(j.attemptsLeft&&!j.codeChanged?' '+j.attemptsLeft+' tries left.':'');
  c.value='';c.focus();
 }catch(x){err.textContent='Cannot reach the phone. Is it still on the same Wi-Fi?'}});
</script></main></body></html>"""
}
