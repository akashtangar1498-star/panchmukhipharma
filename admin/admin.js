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
    $("p-dialog").showModal();
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
    if (!online) {
      var blob = new Blob(["window.SITE = " + JSON.stringify(D, null, 1) + ";\n"], { type: "text/javascript" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "data.js";
      a.click();
      setDirty(false, "Downloaded data.js. Upload it to the assets folder to publish.");
      return;
    }
    $("save").disabled = true;
    $("status").textContent = "Saving...";
    try {
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
    $("logout").hidden = !online;
    if (!online) $("save").textContent = "Save (download file)";
    refreshCatSelects(); renderProducts(); renderCats(); renderCompany(); renderReviews();
  }
  function showLogin(needsSetup) {
    setupMode = needsSetup;
    $("login").hidden = false;
    $("pw2-wrap").hidden = !needsSetup;
    $("pw").autocomplete = needsSetup ? "new-password" : "current-password";
    $("login-btn").textContent = needsSetup ? "Create password" : "Log in";
    $("login-msg").textContent = needsSetup
      ? "First visit: choose a dashboard password (at least 8 characters)."
      : "Enter your dashboard password.";
  }
  $("login-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    $("login-err").textContent = "";
    if (setupMode && $("pw").value !== $("pw2").value) { $("login-err").textContent = "The two passwords do not match."; return; }
    try {
      await call(setupMode ? "setup" : "login", { password: $("pw").value });
      $("pw").value = $("pw2").value = "";
      showApp();
    } catch (err) { $("login-err").textContent = err.message; }
  });
  $("logout").addEventListener("click", async function () {
    if (dirty && !confirm("You have unsaved changes. Log out anyway?")) return;
    dirty = false;
    try { await call("logout"); } catch (err) {}
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
      else showApp();                 // no PHP on this server: edit and download instead
    }
  })();
})();
