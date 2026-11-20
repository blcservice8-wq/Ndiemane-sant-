// Page de connexion minimale pour vérifier l'API depuis un navigateur (téléphone compris).
// Aucun script en ligne (CSP stricte) ; aucune donnée injectée via innerHTML.
export const PAGE_CONNEXION = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>NDIEMANE SANTÉ DIGITAL - Connexion</title>
<style>
:root{--v:#1B8A4B;--b:#14467A;--bg:#F4F8F6;--c:#fff;--t:#1d2b26;--m:#5b6b64;--r:#C0392B}
@media(prefers-color-scheme:dark){:root{--bg:#0f1815;--c:#17231f;--t:#e6efe9;--m:#9fb2a9}}
*{box-sizing:border-box}[hidden]{display:none!important}
body{margin:0;font-family:system-ui,Segoe UI,Arial,sans-serif;background:var(--bg);color:var(--t);min-height:100vh;display:grid;place-items:center;padding:16px}
main{width:100%;max-width:420px;background:var(--c);border-radius:14px;padding:22px;box-shadow:0 2px 10px #0002;border-top:5px solid var(--v)}
h1{font-size:18px;margin:0;color:var(--b)}.sous{margin:2px 0 18px;color:var(--m);font-size:13px}
label{display:block;font-size:13px;margin:12px 0 4px}
input{width:100%;padding:11px;font-size:16px;border:1px solid #9aa9a2;border-radius:8px;background:transparent;color:inherit}
button{margin-top:16px;width:100%;padding:12px;font-size:16px;border:0;border-radius:8px;background:var(--v);color:#fff;font-weight:600}
#msg{color:var(--r);font-size:14px;min-height:20px;margin:10px 0 0}
ul{padding-left:18px;font-size:13px}li{margin:3px 0}.role{display:inline-block;background:var(--b);color:#fff;border-radius:10px;padding:2px 9px;font-size:12px;margin:2px 4px 2px 0}
</style></head><body><main>
<h1>NDIEMANE SANTÉ DIGITAL</h1><p class="sous">Poste de Santé de Ndiemane</p>
<form id="f">
<label for="email">Adresse e-mail</label><input id="email" type="email" autocomplete="username" required maxlength="254">
<label for="mdp">Mot de passe</label><input id="mdp" type="password" autocomplete="current-password" required maxlength="200">
<div id="g" hidden><label for="code">Code de l'application d'authentification (6 chiffres)</label><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}"></div>
<button type="submit">Se connecter</button><p id="msg" role="alert"></p>
</form>
<section id="s" hidden><h1 id="nom"></h1><p id="roles"></p><p class="sous">Modules et actions autorisés :</p><ul id="droits"></ul><button id="out" type="button">Se déconnecter</button></section>
</main><script src="/connexion.js"></script></body></html>`;

export const JS_CONNEXION = `const $ = (i) => document.getElementById(i);
async function api(url, options) {
  const r = await fetch(url, { credentials: "same-origin", ...options });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
}
function afficher(me) {
  $("f").hidden = true; $("s").hidden = false;
  $("nom").textContent = me.utilisateur.nomComplet || me.utilisateur.email;
  const roles = $("roles"); roles.textContent = "";
  for (const r of me.utilisateur.roles) { const s = document.createElement("span"); s.className = "role"; s.textContent = r; roles.appendChild(s); }
  const ul = $("droits"); ul.textContent = "";
  for (const [module, actions] of Object.entries(me.droits)) { const li = document.createElement("li"); li.textContent = module + " : " + actions.join(", "); ul.appendChild(li); }
}
async function charger() {
  const r = await api("/api/me");
  if (r.status === 200) afficher(r.data); else { $("s").hidden = true; $("f").hidden = false; }
}
$("f").addEventListener("submit", async (e) => {
  e.preventDefault(); $("msg").textContent = "";
  const corps = { email: $("email").value.trim(), motDePasse: $("mdp").value };
  const c = $("code").value.trim(); if (c) corps.codeMfa = c;
  const r = await api("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
  if (r.status === 200) { $("mdp").value = ""; $("code").value = ""; await charger(); return; }
  if (r.data && r.data.code === "MFA_REQUIS") $("g").hidden = false;
  $("msg").textContent = (r.data && r.data.message) || "Erreur inattendue.";
});
$("out").addEventListener("click", async () => { await api("/api/auth/logout", { method: "POST" }); $("s").hidden = true; $("f").hidden = false; });
charger();
`;
