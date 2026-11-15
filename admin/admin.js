(function () {
  var D = JSON.parse(JSON.stringify(window.SITE));   // working copy of the site data
  var csrf = "", online = false, dirty = false, editing = -1, setupMode = false;
  var $ = function (id) { return document.getElementById(id); };

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  async function call(action, body) {
    var r = await fetch("api.php?action=" + action, {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF": csrf },
      body: JSON.stringify(body || {})
    });
    var j = await r.json();            // throws if the server is not running PHP
    if (!j || typeof j !== "object") throw new Error("Bad response");
    if (!r.ok) { var e = new Error(j.error || "Request failed"); e.api = true; throw e; }
    return j;
  }
  /* ---------------- direct publishing to GitHub (for GitHub Pages hosting) ----------------
     The access token is typed in by the site owner and kept only in this browser (localStorage).
     With it, Save commits assets/data.js straight to the repository and the site rebuilds itself. */
  var GH_DEFAULT = { repo: "akashtangar1498-star/panchmukhipharma", branch: "main" };
  var gh = null;
  try { gh = JSON.parse(localStorage.getItem("pm_gh")); } catch (err) {}
  if (!gh || !gh.token || !gh.repo) gh = null;

  function ghFetch(cfg, path, opts) {
    opts = opts || {};
    opts.cache = "no-store";
    opts.headers = Object.assign({
      "Accept": "application/vnd.github+json", "Authorization": "Bearer " + cfg.token, "X-GitHub-Api-Version": "2022-11-28"
    }, opts.headers || {});
    return fetch("https://api.github.com/repos/" + cfg.repo + (path ? "/" + path : ""), opts);
  }
  function ghError(r) {
    var e = new Error(
      r.status === 401 ? "GitHub rejected the access token. Disconnect and connect again with a new token." :
      r.status === 403 || r.status === 404 ? "The token cannot write to this repository. It needs 'Contents: Read and write' for " + ((gh || {}).repo || "the repository") + "." :
      "GitHub returned an error (" + r.status + "). Try again in a moment.");
    e.gh = true;
    return e;
  }
  function b64(text) {
    var bytes = new TextEncoder().encode(text), s = "";
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  async function ghPut(file, text, message, isBase64) {
    for (var attempt = 0; attempt < 2; attempt++) {
      var sha = null, r = await ghFetch(gh, "contents/" + file + "?ref=" + encodeURIComponent(gh.branch), { headers: { "Accept": "application/vnd.github.object+json" } });
      if (r.ok) sha = (await r.json()).sha;
      else if (r.status !== 404) throw ghError(r);
      var body = { message: message, content: isBase64 ? text : b64(text), branch: gh.branch };
      if (sha) body.sha = sha;
      r = await ghFetch(gh, "contents/" + file, { method: "PUT", body: JSON.stringify(body) });
      if (r.ok) return;
      if (r.status !== 409 || attempt) throw ghError(r);     // 409: file changed meanwhile, retry once
    }
  }
  // Load the newest saved data from the repository, so edits never start from a stale cached page.
  async function ghLoad() {
    var r = await ghFetch(gh, "contents/assets/data.js?ref=" + encodeURIComponent(gh.branch), { headers: { "Accept": "application/vnd.github.raw+json" } });
    if (!r.ok) throw ghError(r);
    var t = await r.text(), fresh = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    if (fresh && fresh.company && Array.isArray(fresh.products) && Array.isArray(fresh.categories)) {
      D = fresh;
      if (!Array.isArray(D.testimonials)) D.testimonials = [];
    }
  }

  function setDirty(v, msg) {
    dirty = v;
    $("save").disabled = !v;
    $("status").textContent = msg || (v ? "Unsaved changes" : "");
  }
  function catName(id) {
    var c = D.categories.filter(function (x) { return x.id === id; })[0];
    return c ? c.name : "(no category)";
  }
  function countIn(id) { return D.products.filter(function (p) { return p.cat === id; }).length; }

  /* ---------------- products ---------------- */
  function catOptions(withAll) {
    return (withAll ? '<option value="">All categories</option>' : "") + D.categories.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
    }).join("");
  }
  function refreshCatSelects() {
    var keep = $("p-cat").value;
    $("p-cat").innerHTML = catOptions(true);
    $("p-cat").value = keep;
    $("p-form").cat.innerHTML = catOptions(false);
  }
  function renderProducts() {
    var q = $("p-search").value.trim().toLowerCase(), cat = $("p-cat").value, rows = [];
    D.products.forEach(function (p, i) {
      if (cat && p.cat !== cat) return;
      if (q && (p.name + " " + (p.composition || "") + " " + (p.brand || "")).toLowerCase().indexOf(q) === -1) return;
      rows.push('<tr><td>' + esc(p.name) + (p.rx ? '<span class="tag">Rx</span>' : "") + '</td><td>' + esc(catName(p.cat)) +
        '</td><td>' + (p.price ? "&#8377; " + esc(p.price) + (p.unit ? " / " + esc(p.unit) : "") : '<span class="muted">Ask</span>') +
        '</td><td class="act"><button class="btn btn-small btn-light" data-edit="' + i + '">Edit</button> ' +
        '<button class="btn btn-small btn-danger" data-del="' + i + '">Delete</button></td></tr>');
    });
    $("p-rows").innerHTML = rows.join("") || '<tr><td colspan="4" class="muted">No products match.</td></tr>';
    $("p-count").textContent = rows.length + " of " + D.products.length + " products";
  }
  var TEXT_FIELDS = ["name", "price", "unit", "composition", "strength", "form", "pack", "brand", "manufacturer", "image"];
  function openProduct(i) {
    if (!D.categories.length) { alert("Add a category first."); return; }
    editing = i;
    var p = i >= 0 ? D.products[i] : { cat: $("p-cat").value || D.categories[0].id, rx: true }, f = $("p-form");
    $("p-title").textContent = i >= 0 ? "Edit product" : "Add product";
    TEXT_FIELDS.forEach(function (k) { f[k].value = p[k] || ""; });
    f.cat.value = p.cat;
    f.rx.checked = !!p.rx;
    $("p-file").value = "";
    showPreview();
    $("p-dialog").showModal();
  }

  /* ---- product photos: chosen in the form, uploaded only when Save is pressed ---- */
  var pendingImages = {};   // path -> base64 JPEG waiting to be uploaded
  var previews = {};        // path -> data URL, so a new photo shows before the site has rebuilt
  function showPreview() {
    var v = $("p-form").image.value.trim(), img = $("p-preview");
    img.hidden = !v;
    $("p-noimg").hidden = !v;
    if (v) img.src = previews[v] || (/^https:\/\//.test(v) ? v : "../" + v);
  }
  function shrink(file) {   // resize to at most 900px and re-encode as JPEG
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var k = Math.min(1, 900 / Math.max(im.naturalWidth, im.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.naturalWidth * k));
        c.height = Math.max(1, Math.round(im.naturalHeight * k));
        var g = c.getContext("2d");
        g.fillStyle = "#fff";
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error("not an image")); };
      im.src = url;
    });
  }
  $("p-file").addEventListener("change", async function (e) {
    var file = e.target.files[0], f = $("p-form");
    if (!file) return;
    if (!online && !gh) { alert("Connect GitHub first (yellow box at the top). Photos are uploaded through that connection."); e.target.value = ""; return; }
    try {
      var dataUrl = await shrink(file);
      var base = f.name.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "product";
      var path = "assets/img/" + base + "-" + Date.now().toString(36) + ".jpg";
      pendingImages[path] = dataUrl.split(",")[1];
      previews[path] = dataUrl;
      f.image.value = path;
      showPreview();
    } catch (err) { alert("That file could not be read as an image. Use a JPG or PNG photo."); e.target.value = ""; }
  });
  $("p-noimg").addEventListener("click", function () { $("p-form").image.value = ""; $("p-file").value = ""; showPreview(); });
  $("p-form").image.addEventListener("input", showPreview);
  // Uploads photos that are still used by a product; called right before the data is saved.
  async function uploadPendingImages() {
    var paths = Object.keys(pendingImages).filter(function (p) { return D.products.some(function (x) { return x.image === p; }); });
    for (var i = 0; i < paths.length; i++) {
      $("status").textContent = "Uploading photo " + (i + 1) + " of " + paths.length + "...";
      if (online) await call("upload", { path: paths[i], data: pendingImages[paths[i]] });
      else await ghPut(paths[i], pendingImages[paths[i]], "Add product photo", true);
      delete pendingImages[paths[i]];
    }
  }
  $("p-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, p = editing >= 0 ? D.products[editing] : {};
    TEXT_FIELDS.forEach(function (k) { p[k] = f[k].value.trim(); });
    p.cat = f.cat.value;
    p.rx = f.rx.checked;
    if (editing < 0) D.products.unshift(p);
    $("p-dialog").close();
    setDirty(true);
    renderProducts(); renderCats();
  });
  $("p-cancel").addEventListener("click", function () { $("p-dialog").close(); });
  $("p-add").addEventListener("click", function () { openProduct(-1); });
  $("p-search").addEventListener("input", renderProducts);
  $("p-cat").addEventListener("change", renderProducts);
  $("p-rows").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.edit) openProduct(+b.dataset.edit);
    if (b.dataset.del && confirm('Delete "' + D.products[+b.dataset.del].name + '"?')) {
      D.products.splice(+b.dataset.del, 1);
      setDirty(true);
      renderProducts(); renderCats();
    }
  });

  /* ---------------- categories ---------------- */
  function renderCats() {
    $("c-rows").innerHTML = D.categories.map(function (c, i) {
      var n = countIn(c.id);
      return '<tr><td><input data-name="' + i + '" value="' + esc(c.name) + '" maxlength="100" aria-label="Category name"></td><td>' + n + '</td>' +
        '<td class="act" style="text-align:left"><button class="btn btn-small btn-light" data-up="' + i + '"' + (i === 0 ? " disabled" : "") + ' aria-label="Move up">&uarr;</button> ' +
        '<button class="btn btn-small btn-light" data-down="' + i + '"' + (i === D.categories.length - 1 ? " disabled" : "") + ' aria-label="Move down">&darr;</button></td>' +
        '<td class="act"><button class="btn btn-small btn-danger" data-cdel="' + i + '"' + (n ? ' disabled title="Move or delete its products first"' : "") + '>Delete</button></td></tr>';
    }).join("") || '<tr><td colspan="4" class="muted">No categories yet.</td></tr>';
  }
  $("c-rows").addEventListener("change", function (e) {
    var i = e.target.dataset.name;
    if (i === undefined) return;
    var v = e.target.value.trim();
    if (!v) { e.target.value = D.categories[+i].name; return; }
    D.categories[+i].name = v;
    setDirty(true);
    refreshCatSelects(); renderProducts();
  });
  $("c-rows").addEventListener("click", function (e) {
    var b = e.target.closest("button"), L = D.categories;
    if (!b) return;
    var swap = function (a, z) { var t = L[a]; L[a] = L[z]; L[z] = t; };
    if (b.dataset.up) swap(+b.dataset.up, +b.dataset.up - 1);
    else if (b.dataset.down) swap(+b.dataset.down, +b.dataset.down + 1);
    else if (b.dataset.cdel) { if (!confirm('Delete category "' + L[+b.dataset.cdel].name + '"?')) return; L.splice(+b.dataset.cdel, 1); }
    else return;
    setDirty(true);
    renderCats(); refreshCatSelects(); renderProducts();
  });
  function addCategory() {
    var name = $("c-new").value.trim();
    if (!name) return;
    var base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "category", id = base, n = 2;
    while (D.categories.some(function (c) { return c.id === id; })) id = base + "-" + n++;
    D.categories.push({ id: id, name: name });
    $("c-new").value = "";
    setDirty(true);
    renderCats(); refreshCatSelects();
  }
  $("c-add").addEventListener("click", addCategory);
  $("c-new").addEventListener("keydown", function (e) { if (e.key === "Enter") addCategory(); });

  /* ---------------- company details ---------------- */
  var COMPANY = [
    ["name", "Business name"], ["legalName", "Registered firm (GST holder)"], ["tagline", "Tagline", 1], ["city", "City line (under the logo)"],
    ["contactPerson", "Contact person"], ["address", "Full address", 1], ["phone", "Phone"], ["whatsapp", "WhatsApp (digits with country code)"],
    ["email", "Email"], ["gst", "GST No."], ["iec", "Import Export Code (IEC)"], ["drugLicence", "Drug licence No."],
    ["established", "Year established"], ["legalStatus", "Legal status"], ["nature", "Nature of business", 1]
  ];
  var LISTS = [["markets", "Export countries (comma separated)"], ["payment", "Payment modes (comma separated)"], ["shipment", "Shipment modes (comma separated)"]];
  function renderCompany() {
    var C = D.company;
    $("company-form").innerHTML =
      COMPANY.map(function (f) {
        return '<label' + (f[2] ? ' class="full"' : "") + '>' + f[1] + '<input data-key="' + f[0] + '" value="' + esc(C[f[0]]) + '" maxlength="300"></label>';
      }).join("") +
      LISTS.map(function (f) {
        return '<label class="full">' + f[1] + '<input data-list="' + f[0] + '" value="' + esc((C[f[0]] || []).join(", ")) + '" maxlength="600"></label>';
      }).join("") +
      '<label class="full">About us text (leave a blank line between paragraphs)<textarea id="about" rows="8">' + esc((D.about || []).join("\n\n")) + '</textarea></label>';
  }
  $("company-form").addEventListener("input", function (e) {
    var t = e.target;
    if (t.dataset.key) D.company[t.dataset.key] = t.value.trim();
    else if (t.dataset.list) D.company[t.dataset.list] = t.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    else if (t.id === "about") D.about = t.value.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    setDirty(true);
  });

  /* ---------------- reviews ---------------- */
  if (!Array.isArray(D.testimonials)) D.testimonials = [];
  var rEditing = -1, R_FIELDS = ["name", "company", "country", "text", "date"];
  function renderReviews() {
    $("r-rows").innerHTML = D.testimonials.map(function (t, i) {
      var text = String(t.text || "");
      return '<tr><td>' + esc(t.name) + (t.country ? '<br><span class="muted">' + esc(t.country) + '</span>' : "") + '</td><td>' +
        (parseInt(t.rating, 10) || 5) + ' / 5</td><td>' + esc(text.length > 90 ? text.slice(0, 90) + "..." : text) + '</td>' +
        '<td class="act"><button class="btn btn-small btn-light" data-redit="' + i + '">Edit</button> ' +
        '<button class="btn btn-small btn-danger" data-rdel="' + i + '">Delete</button></td></tr>';
    }).join("") || '<tr><td colspan="4" class="muted">No reviews yet. The reviews section stays hidden on the site until you add one.</td></tr>';
    $("r-count").textContent = D.testimonials.length + " review" + (D.testimonials.length === 1 ? "" : "s");
  }
  function openReview(i) {
    rEditing = i;
    var t = i >= 0 ? D.testimonials[i] : {}, f = $("r-form");
    $("r-title").textContent = i >= 0 ? "Edit review" : "Add review";
    R_FIELDS.forEach(function (k) { f[k].value = t[k] || ""; });
    f.rating.value = String(parseInt(t.rating, 10) || 5);
    $("r-dialog").showModal();
  }
  $("r-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, t = rEditing >= 0 ? D.testimonials[rEditing] : {};
    R_FIELDS.forEach(function (k) { t[k] = f[k].value.trim(); });
    t.rating = parseInt(f.rating.value, 10);
    if (rEditing < 0) D.testimonials.unshift(t);
    $("r-dialog").close();
    setDirty(true);
    renderReviews();
  });
  $("r-cancel").addEventListener("click", function () { $("r-dialog").close(); });
  $("r-add").addEventListener("click", function () { openReview(-1); });
  $("r-rows").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.redit) openReview(+b.dataset.redit);
    if (b.dataset.rdel && confirm('Delete the review from "' + D.testimonials[+b.dataset.rdel].name + '"?')) {
      D.testimonials.splice(+b.dataset.rdel, 1);
      setDirty(true);
      renderReviews();
    }
  });

  /* ---------------- tabs, save, login ---------------- */
  $("tabs").addEventListener("click", function (e) {
    var tab = e.target.dataset.tab;
    if (!tab) return;
    [].forEach.call($("tabs").children, function (b) { b.classList.toggle("active", b === e.target); });
    ["products", "categories", "reviews", "company"].forEach(function (t) { $("tab-" + t).hidden = t !== tab; });
  });

  $("save").addEventListener("click", async function () {
    if (!D.company.name) { alert("Business name cannot be empty."); return; }
    if (!online && gh) {
      $("save").disabled = true;
      $("status").textContent = "Publishing...";
      try {
        await uploadPendingImages();
        $("status").textContent = "Publishing...";
        await ghPut("assets/data.js", "window.SITE = " + JSON.stringify(D, null, 1) + ";\n", "Update site content from dashboard");
        setDirty(false, "Published at " + new Date().toLocaleTimeString() + ". The live site updates in a few minutes.");
      } catch (err) {
        setDirty(true, "Publish failed: " + (err.gh ? err.message : "no connection to GitHub. Check your internet and try again."));
      }
      return;
    }
    if (!online) {
      download("data.js", "window.SITE = " + JSON.stringify(D, null, 1) + ";\n");
      setDirty(false, "Downloaded data.js. Upload it to the assets folder to publish.");
      return;
    }
    $("save").disabled = true;
    $("status").textContent = "Saving...";
    try {
      await uploadPendingImages();
      await call("save", D);
      setDirty(false, "Saved to website at " + new Date().toLocaleTimeString());
    } catch (err) {
      setDirty(true, "Save failed: " + err.message);
      if (/log in/i.test(err.message)) alert("Your session expired. Reload this page and log in again; unsaved changes will be lost.");
    }
  });
  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  function showApp() {
    $("login").hidden = true;
    $("app").hidden = false;
    $("offline").hidden = online;
    $("logout").hidden = !online && !window.ADMIN_LOCK;
    renderMode();
    renderAll();
  }
  function renderAll() { refreshCatSelects(); renderProducts(); renderCats(); renderCompany(); renderReviews(); }
  function renderMode() {
    if (online) return;
    $("save").textContent = gh ? "Save & publish" : "Save (download file)";
    $("set-pw").textContent = window.ADMIN_LOCK ? "Change dashboard password" : "Set a dashboard password";
    $("gh-connect").hidden = !!gh;
    $("gh-disconnect").hidden = !gh;
    $("mode-text").textContent = gh
      ? "Connected to GitHub (" + gh.repo + "). Save publishes your changes directly; the live site updates in a few minutes."
      : "Not connected to GitHub yet, so Save downloads a file named data.js that has to be uploaded into the assets folder by hand. Connect GitHub once to publish with one click.";
  }
  // Opens the dashboard on hosting without PHP: pull the newest data from GitHub first when connected.
  async function enterApp() {
    var note = "";
    if (gh) { try { await ghLoad(); } catch (err) { note = err.gh ? err.message : "Could not reach GitHub; showing the last published copy."; } }
    showApp();
    if (note) $("status").textContent = note;
  }

  $("gh-connect").addEventListener("click", function () {
    var f = $("gh-form");
    f.repo.value = GH_DEFAULT.repo;
    f.branch.value = GH_DEFAULT.branch;
    f.token.value = "";
    $("gh-err").textContent = "";
    $("gh-dialog").showModal();
  });
  $("gh-cancel").addEventListener("click", function () { $("gh-dialog").close(); });
  $("gh-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = e.target, cfg = { repo: f.repo.value.trim().replace(/^https:\/\/github\.com\//, "").replace(/\/+$/, ""), branch: f.branch.value.trim() || "main", token: f.token.value.trim() };
    $("gh-err").textContent = "Checking...";
    try {
      var r = await ghFetch(cfg, "");
      if (r.status === 401) { $("gh-err").textContent = "GitHub did not accept this token. Copy it again, with no spaces."; return; }
      if (!r.ok) { $("gh-err").textContent = "This token cannot see the repository " + cfg.repo + ". Check the repository name and the token's repository access."; return; }
      var info = await r.json();
      if (info.permissions && info.permissions.push === false) { $("gh-err").textContent = "This token can read the repository but not write to it. Give it 'Contents: Read and write'."; return; }
    } catch (err) { $("gh-err").textContent = "Could not reach GitHub. Check your internet connection."; return; }
    gh = cfg;
    try { localStorage.setItem("pm_gh", JSON.stringify(gh)); } catch (err) {}
    f.token.value = "";
    $("gh-dialog").close();
    if (!dirty) { try { await ghLoad(); renderAll(); } catch (err) {} }
    renderMode();
    $("status").textContent = "Connected to GitHub.";
  });
  $("gh-disconnect").addEventListener("click", function () {
    if (!confirm("Disconnect GitHub on this device? The access token will be removed from this browser.")) return;
    gh = null;
    try { localStorage.removeItem("pm_gh"); } catch (err) {}
    renderMode();
  });
  function showLogin(needsSetup, msg) {
    setupMode = needsSetup;
    $("login").hidden = false;
    $("login-err").textContent = "";
    $("pw2-wrap").hidden = !needsSetup;
    $("pw").autocomplete = needsSetup ? "new-password" : "current-password";
    $("login-btn").textContent = needsSetup ? "Create password" : "Log in";
    $("login-msg").textContent = msg || (needsSetup)
      ? msg || "First visit: choose a dashboard password (at least 8 characters)."
      : "Enter your dashboard password.";
  }
  /* Password lock for hosting without PHP (e.g. GitHub Pages). The password is checked in the browser
     against a salted hash kept in admin/lock.js; the password itself is never stored or sent anywhere. */
  function hex(bytes) { return [].map.call(bytes, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  async function derive(pw, saltHex) {
    var salt = new Uint8Array(saltHex.match(/../g).map(function (h) { return parseInt(h, 16); }));
    var key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
    var bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: 250000 }, key, 256);
    return hex(new Uint8Array(bits));
  }
  function download(name, text) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
    a.download = name;
    a.click();
  }
  function remember(hash) { try { sessionStorage.setItem("pm_unlocked", hash); } catch (err) {} }
  function unlocked(hash) { try { return sessionStorage.getItem("pm_unlocked") === hash; } catch (err) { return false; } }

  $("set-pw").addEventListener("click", function () {
    if (dirty && !confirm("Save your changes first, or they will be lost. Continue anyway?")) return;
    $("app").hidden = true;
    showLogin(true, gh
      ? "Choose a dashboard password (at least 8 characters). It is saved to GitHub and becomes active in a few minutes."
      : "Choose a dashboard password (at least 8 characters). A file named lock.js will download; upload it into the admin folder to switch the lock on.");
  });

  $("login-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    $("login-err").textContent = "";
    if (setupMode && $("pw").value !== $("pw2").value) { $("login-err").textContent = "The two passwords do not match."; return; }
    if (!online) {
      try {
        var L = window.ADMIN_LOCK;
        if (setupMode) {
          var salt = hex(crypto.getRandomValues(new Uint8Array(16)));
          L = window.ADMIN_LOCK = { salt: salt, hash: await derive($("pw").value, salt) };
          var lockText = "window.ADMIN_LOCK = " + JSON.stringify(L) + ";\n";
          if (gh) {
            await ghPut("admin/lock.js", lockText, "Update dashboard password lock");
            alert("Password saved to GitHub.\n\nIn a few minutes this dashboard will ask for it on every visit.");
          } else {
            download("lock.js", lockText);
            alert("lock.js has been downloaded.\n\nUpload it into the admin folder of your site. Once it is live, this dashboard will ask for the password.");
          }
        } else if ((await derive($("pw").value, L.salt)) !== L.hash) {
          $("login-err").textContent = "Wrong password.";
          return;
        }
        var wasSetup = setupMode;
        remember(L.hash);
        $("pw").value = $("pw2").value = "";
        if (wasSetup) showApp(); else await enterApp();
      } catch (err) { $("login-err").textContent = err.gh ? err.message : "This browser cannot check the password. Use a current Chrome, Edge or Firefox over https."; }
      return;
    }
    try {
      await call(setupMode ? "setup" : "login", { password: $("pw").value });
      $("pw").value = $("pw2").value = "";
      showApp();
    } catch (err) { $("login-err").textContent = err.message; }
  });
  $("logout").addEventListener("click", async function () {
    if (dirty && !confirm("You have unsaved changes. Log out anyway?")) return;
    dirty = false;
    if (online) { try { await call("logout"); } catch (err) {} }
    else { try { sessionStorage.removeItem("pm_unlocked"); } catch (err) {} }
    location.reload();
  });

  (async function init() {
    try {
      var s = await call("status");
      online = true;
      csrf = s.csrf;
      if (s.loggedIn) showApp(); else showLogin(!s.setup);
    } catch (err) {
      if (err.api) { online = true; showLogin(false); $("login-err").textContent = err.message; }
      else {                          // no PHP on this server: edit and download instead
        var L = window.ADMIN_LOCK;
        if (L && L.salt && L.hash && !unlocked(L.hash)) showLogin(false);
        else await enterApp();
      }
    }
  })();
})();
