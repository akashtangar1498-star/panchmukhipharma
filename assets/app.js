(function () {
  var S = window.SITE, C = S.company;
  var page = document.body.getAttribute("data-page");
  var params = new URLSearchParams(location.search);

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function catName(id) {
    var c = S.categories.filter(function (x) { return x.id === id; })[0];
    return c ? c.name : "";
  }
  var telHref = "tel:" + C.phone.replace(/[^\d+]/g, "");

  /* ---------- header + footer (shared by every page) ---------- */
  var nav = [["index.html", "Home", "home"], ["about.html", "About Us", "about"],
             ["products.html", "Products", "products"], ["contact.html", "Contact Us", "contact"]];
  $("site-header").innerHTML =
    '<div class="topbar"><div class="wrap topbar-in">' +
      '<span>GST: ' + esc(C.gst) + '</span>' + (C.drugLicence ? '<span>Drug Licence: ' + esc(C.drugLicence) + '</span>' : '') +
      '<a href="mailto:' + esc(C.email) + '">' + esc(C.email) + '</a>' +
    '</div></div>' +
    '<div class="wrap head-in">' +
      '<a class="brand" href="index.html"><img class="brand-logo" src="assets/logo-mark.png" alt="" width="52" height="52">' +
        '<span><strong>' + esc(C.name) + '</strong><small>' + esc(C.city) + '</small></span></a>' +
      '<button class="nav-toggle" aria-label="Menu" aria-expanded="false">&#9776;</button>' +
      '<nav class="nav" id="nav">' +
        nav.map(function (n) {
          return '<a href="' + n[0] + '"' + (n[2] === page ? ' class="active"' : "") + '>' + n[1] + '</a>';
        }).join("") +
        (C.phone ? '<a class="btn btn-accent" href="' + esc(telHref) + '">Call ' + esc(C.phone) + '</a>'
                 : '<a class="btn btn-accent" href="contact.html">Send Enquiry</a>') +
      '</nav>' +
    '</div>';
  var toggle = document.querySelector(".nav-toggle");
  toggle.addEventListener("click", function () {
    var open = $("nav").classList.toggle("open");
    toggle.setAttribute("aria-expanded", open);
  });

  $("site-footer").innerHTML =
    '<div class="wrap foot-grid">' +
      '<div><h4>' + esc(C.name) + '</h4><p>' + esc(C.tagline) + '</p><p>' + esc(C.address) + '</p></div>' +
      '<div><h4>Products</h4><ul>' +
        S.categories.slice(0, 6).map(function (c) {
          return '<li><a href="products.html?cat=' + encodeURIComponent(c.id) + '">' + esc(c.name) + '</a></li>';
        }).join("") + '</ul></div>' +
      '<div><h4>Contact</h4><ul>' + (C.phone ? '<li><a href="' + esc(telHref) + '">' + esc(C.phone) + '</a></li>' : '') +
        '<li><a href="mailto:' + esc(C.email) + '">' + esc(C.email) + '</a></li>' +
        '<li>GST: ' + esc(C.gst) + '</li><li>IEC: ' + esc(C.iec) + '</li></ul></div>' +
    '</div>' +
    '<div class="wrap disclaimer">Prescription medicines (marked Rx) are supplied only to licensed buyers or against a valid ' +
      'prescription, and only where import is permitted by the laws of the destination country. Product information on this ' +
      'site is for trade reference and is not medical advice.</div>' +
    '<div class="wrap copyright">&copy; ' + new Date().getFullYear() + ' ' + esc(C.name) +
      (C.legalName ? ' (' + esc(C.legalName) + ')' : '') + '. All rights reserved.</div>';

  /* ---------- building blocks ---------- */
  function productCard(p) {
    var media = p.image
      ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">'
      : '<span class="ph">' + esc(p.form || "Rx") + '</span>';
    return '<article class="card product">' +
      '<div class="product-media">' + media + (p.rx ? '<span class="rx" title="Prescription medicine">Rx</span>' : "") + '</div>' +
      '<div class="product-body"><h3>' + esc(p.name) + '</h3>' +
      '<p class="muted">' + esc(catName(p.cat)) + '</p>' +
      '<p class="price">' + (p.price ? 'Approx. <strong>&#8377; ' + esc(p.price) + '</strong> / ' + esc(p.unit) : 'Ask for price') + '</p>' +
      '<dl>' + [["Composition", p.composition], ["Strength", p.strength], ["Pack", p.pack], ["Brand", p.brand], ["Mfr.", p.manufacturer]]
        .filter(function (r) { return r[1]; })
        .map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join("") + '</dl>' +
      '<a class="btn btn-primary" href="contact.html?product=' + encodeURIComponent(p.name) + '">Get Best Quote</a>' +
      '</div></article>';
  }
  function factRows(rows) {
    return rows.filter(function (r) { return r[1]; }).map(function (r) {
      return '<tr><th>' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>';
    }).join("");
  }
  var facts = (C.legalName ? [["Registered Firm", C.legalName]] : []).concat([
    ["Nature of Business", C.nature], ["Legal Status", C.legalStatus], ["Year of Establishment", C.established],
    ["GST No.", C.gst], ["Import Export Code (IEC)", C.iec], ["Drug Licence No.", C.drugLicence]
  ]);

  /* ---------- pages ---------- */
  if (page === "home") {
    $("hero-title").textContent = C.name;
    $("hero-tag").textContent = C.tagline;
    $("home-about").textContent = S.about[0];
    $("home-facts").innerHTML = factRows(facts);
    $("home-cats").innerHTML = S.categories.map(function (c) {
      var n = S.products.filter(function (p) { return p.cat === c.id; }).length;
      return '<a class="card cat" href="products.html?cat=' + encodeURIComponent(c.id) + '"><h3>' + esc(c.name) +
        '</h3><span class="muted">' + n + ' product' + (n === 1 ? "" : "s") + ' &rarr;</span></a>';
    }).join("");
    $("home-products").innerHTML = S.products.slice(0, 8).map(productCard).join("");
    var T = S.testimonials || [];
    // Preview only: open index.html?sample=reviews to see how the section looks before real reviews exist.
    if (!T.length && params.get("sample") === "reviews") {
      T = [
        { name: "Sample Customer 1", company: "Sample Company", country: "Country", rating: 5, date: "Month Year",
          text: "Sample review. This is placeholder text showing where a customer's feedback will appear. Replace it with a real review in the dashboard." },
        { name: "Sample Customer 2", country: "Country", rating: 4,
          text: "Sample review. A longer placeholder so you can see how the cards line up when reviews are different lengths. Real reviews you add in the dashboard will replace these samples." },
        { name: "Sample Customer 3", company: "Sample Company", rating: 5,
          text: "Sample review. Short placeholder." }
      ];
    }
    if (T.length) {
      $("home-reviews-section").hidden = false;
      $("home-reviews").innerHTML = T.map(function (t) {
        var r = Math.max(1, Math.min(5, parseInt(t.rating, 10) || 5));
        var who = [t.company, t.country].filter(Boolean).join(", ");
        return '<figure class="card review"><div class="stars" role="img" aria-label="' + r + ' out of 5 stars">' +
          new Array(r + 1).join("&#9733;") + '<span>' + new Array(6 - r).join("&#9733;") + '</span></div>' +
          '<blockquote>' + esc(t.text) + '</blockquote>' +
          '<figcaption><strong>' + esc(t.name) + '</strong>' + (who ? '<span class="muted">' + esc(who) + '</span>' : "") +
          (t.date ? '<span class="muted">' + esc(t.date) + '</span>' : "") + '</figcaption></figure>';
      }).join("");
    }
  }

  if (page === "about") {
    $("about-text").innerHTML = S.about.map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("");
    $("about-facts").innerHTML = factRows(facts.concat([
      ["Contact Person", C.contactPerson], ["Registered Address", C.address],
      ["Export Markets", C.markets.join(", ")], ["Payment Modes", C.payment.join(", ")],
      ["Shipment Modes", C.shipment.join(", ")]
    ]));
  }

  if (page === "products") {
    var active = params.get("cat") || "";
    var search = $("search");
    search.value = params.get("q") || "";
    $("cat-list").innerHTML =
      '<a href="products.html"' + (active ? "" : ' class="active"') + '>All Products</a>' +
      S.categories.map(function (c) {
        return '<a href="products.html?cat=' + encodeURIComponent(c.id) + '"' +
          (c.id === active ? ' class="active"' : "") + '>' + esc(c.name) + '</a>';
      }).join("");
    // phones and tablets get a compact dropdown instead of the long category list
    var sel = $("cat-select");
    sel.innerHTML = '<option value="">All Products</option>' + S.categories.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
    }).join("");
    sel.value = catName(active) ? active : "";
    sel.addEventListener("change", function () {
      location.href = "products.html" + (sel.value ? "?cat=" + encodeURIComponent(sel.value) : "");
    });
    $("products-title").textContent = catName(active) || "All Products";
    var render = function () {
      var q = search.value.trim().toLowerCase();
      var list = S.products.filter(function (p) {
        return (!active || p.cat === active) &&
          (!q || (p.name + " " + p.composition).toLowerCase().indexOf(q) !== -1);
      });
      $("product-grid").innerHTML = list.length
        ? list.map(productCard).join("")
        : '<p class="muted">No products match. Try another search, or <a href="contact.html">send us your requirement</a>.</p>';
    };
    search.addEventListener("input", render);
    render();
  }

  if (page === "contact") {
    $("contact-details").innerHTML = factRows([
      ["Contact Person", C.contactPerson], ["Address", C.address], ["Phone", C.phone], ["Email", C.email]
    ]);
    var form = $("enquiry");
    form.product.value = params.get("product") || "";
    if (params.get("review")) {
      document.querySelector(".page-head h1").textContent = "Share Your Experience";
      document.querySelector(".page-head p").textContent = "Tell us how your order went. With your permission we may publish it on this site.";
      form.product.value = "Customer review";
      form.message.placeholder = "Your review";
      form.message.required = true;
    }
    var message = function () {
      var f = form;
      return ["Enquiry from " + f.name.value, "Company: " + f.company.value, "Country: " + f.country.value,
        "Email: " + f.email.value, "Phone: " + f.phone.value, "Product: " + f.product.value,
        "Quantity: " + f.quantity.value, "", f.message.value].join("\n");
    };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      location.href = "mailto:" + C.email + "?subject=" +
        encodeURIComponent("Enquiry: " + (form.product.value || "Product requirement")) +
        "&body=" + encodeURIComponent(message());
    });
    var wa = $("wa-btn");
    if (C.whatsapp) {
      wa.addEventListener("click", function () {
        if (!form.reportValidity()) return;
        window.open("https://wa.me/" + C.whatsapp + "?text=" + encodeURIComponent(message()), "_blank", "noopener");
      });
    } else {
      wa.hidden = true;
    }
  }
})();
