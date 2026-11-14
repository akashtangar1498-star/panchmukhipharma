<?php
/* Save service for the dashboard. Writes ../assets/data.js after a password login.
   To reset a forgotten password: delete admin/config.php in File Manager, then open
   the dashboard and choose a new one. */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const CONFIG_FILE   = __DIR__ . '/config.php';
const ATTEMPTS_FILE = __DIR__ . '/attempts.json';
const DATA_FILE     = __DIR__ . '/../assets/data.js';
const BACKUP_FILE   = __DIR__ . '/../assets/data.backup.js';

function out(array $d, int $code = 200): void {
    http_response_code($code);
    echo json_encode($d);
    exit;
}
function str($v, int $max = 300): string {
    if (!is_scalar($v)) return '';
    $s = trim((string) $v);
    return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max);
}
function strList($v, int $maxItems = 60): array {
    $o = [];
    if (is_array($v)) foreach (array_slice($v, 0, $maxItems) as $x) { $s = str($x, 2000); if ($s !== '') $o[] = $s; }
    return $o;
}
function attempts(): array {
    $a = is_file(ATTEMPTS_FILE) ? json_decode((string) file_get_contents(ATTEMPTS_FILE), true) : null;
    if (!is_array($a) || time() - (int) ($a['since'] ?? 0) > 900) $a = ['count' => 0, 'since' => time()];
    return $a;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'POST only'], 405);

$secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_name('pmadmin');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Strict']);
session_start();
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));

$action = (string) ($_GET['action'] ?? '');
$body = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($body)) $body = [];

$cfg  = is_file(CONFIG_FILE) ? include CONFIG_FILE : [];
$hash = is_array($cfg) ? (string) ($cfg['hash'] ?? '') : '';
$loggedIn = $hash !== '' && !empty($_SESSION['ok']);

if ($action === 'status') {
    out(['setup' => $hash !== '', 'loggedIn' => $loggedIn, 'csrf' => $_SESSION['csrf']]);
}
if (!hash_equals($_SESSION['csrf'], (string) ($_SERVER['HTTP_X_CSRF'] ?? ''))) {
    out(['error' => 'Session expired. Reload the page.'], 403);
}

if ($action === 'setup') {
    if ($hash !== '') out(['error' => 'A password is already set.'], 403);
    $pw = is_string($body['password'] ?? null) ? $body['password'] : '';
    if (strlen($pw) < 8) out(['error' => 'Password must be at least 8 characters.'], 400);
    $php = "<?php return ['hash' => " . var_export(password_hash($pw, PASSWORD_DEFAULT), true) . "];\n";
    if (file_put_contents(CONFIG_FILE, $php, LOCK_EX) === false) out(['error' => 'Cannot write to the admin folder. Check its permissions.'], 500);
    if (function_exists('opcache_invalidate')) @opcache_invalidate(CONFIG_FILE, true);
    session_regenerate_id(true);
    $_SESSION['ok'] = true;
    out(['ok' => true]);
}

if ($action === 'login') {
    $a = attempts();
    if ($a['count'] >= 10) out(['error' => 'Too many wrong attempts. Try again in 15 minutes.'], 429);
    $pw = is_string($body['password'] ?? null) ? $body['password'] : '';
    if ($hash === '' || !password_verify($pw, $hash)) {
        $a['count']++;
        @file_put_contents(ATTEMPTS_FILE, json_encode($a), LOCK_EX);
        sleep(1);
        out(['error' => 'Wrong password.'], 401);
    }
    @unlink(ATTEMPTS_FILE);
    session_regenerate_id(true);
    $_SESSION['ok'] = true;
    out(['ok' => true]);
}

if ($action === 'logout') {
    $_SESSION = [];
    session_destroy();
    out(['ok' => true]);
}

if ($action === 'save') {
    if (!$loggedIn) out(['error' => 'Please log in again.'], 401);

    $c = is_array($body['company'] ?? null) ? $body['company'] : [];
    $company = [];
    foreach (['name', 'tagline', 'legalName', 'city', 'address', 'phone', 'whatsapp', 'email', 'gst', 'iec',
              'drugLicence', 'established', 'nature', 'legalStatus', 'contactPerson'] as $k) {
        $company[$k] = str($c[$k] ?? '');
    }
    $company['whatsapp'] = preg_replace('/\D/', '', $company['whatsapp']);
    foreach (['markets', 'payment', 'shipment'] as $k) $company[$k] = strList($c[$k] ?? []);
    if ($company['name'] === '') out(['error' => 'Business name cannot be empty.'], 400);

    $categories = [];
    $ids = [];
    foreach ((is_array($body['categories'] ?? null) ? $body['categories'] : []) as $cat) {
        $id = is_array($cat) ? str($cat['id'] ?? '', 60) : '';
        $name = is_array($cat) ? str($cat['name'] ?? '', 100) : '';
        if (!preg_match('/^[a-z0-9-]{1,60}$/', $id) || $name === '' || isset($ids[$id])) continue;
        $ids[$id] = true;
        $categories[] = ['id' => $id, 'name' => $name];
    }

    $products = [];
    $in = is_array($body['products'] ?? null) ? $body['products'] : [];
    if (count($in) > 5000) out(['error' => 'Too many products.'], 400);
    foreach ($in as $p) {
        if (!is_array($p)) continue;
        $name = str($p['name'] ?? '', 200);
        $cat = str($p['cat'] ?? '', 60);
        if ($name === '' || !isset($ids[$cat])) continue;
        $image = str($p['image'] ?? '');
        if (!preg_match('~^(https://|assets/)[^\s"\'<>\\\\]+$~', $image)) $image = '';
        $products[] = [
            'name' => $name, 'cat' => $cat,
            'price' => str($p['price'] ?? '', 20), 'unit' => str($p['unit'] ?? '', 30),
            'composition' => str($p['composition'] ?? ''), 'strength' => str($p['strength'] ?? '', 100),
            'form' => str($p['form'] ?? '', 60), 'pack' => str($p['pack'] ?? '', 100),
            'brand' => str($p['brand'] ?? '', 100), 'manufacturer' => str($p['manufacturer'] ?? '', 150),
            'image' => $image, 'rx' => !empty($p['rx']),
        ];
    }

    $testimonials = [];
    foreach (array_slice(is_array($body['testimonials'] ?? null) ? $body['testimonials'] : [], 0, 200) as $t) {
        if (!is_array($t)) continue;
        $name = str($t['name'] ?? '', 100);
        $text = str($t['text'] ?? '', 1500);
        if ($name === '' || $text === '') continue;
        $testimonials[] = [
            'name' => $name, 'company' => str($t['company'] ?? '', 150), 'country' => str($t['country'] ?? '', 80),
            'rating' => max(1, min(5, (int) (is_scalar($t['rating'] ?? null) ? $t['rating'] : 5))),
            'text' => $text, 'date' => str($t['date'] ?? '', 20),
        ];
    }

    $site = ['company' => $company, 'about' => strList($body['about'] ?? [], 20), 'categories' => $categories,
             'products' => $products, 'testimonials' => $testimonials];
    $json = json_encode($site, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) out(['error' => 'Could not encode the data.'], 400);

    if (is_file(DATA_FILE)) @copy(DATA_FILE, BACKUP_FILE);
    $tmp = DATA_FILE . '.tmp';
    if (file_put_contents($tmp, "window.SITE = " . $json . ";\n", LOCK_EX) === false || !rename($tmp, DATA_FILE)) {
        @unlink($tmp);
        out(['error' => 'Cannot write to the assets folder. Check its permissions.'], 500);
    }
    out(['ok' => true, 'products' => count($products), 'categories' => count($categories)]);
}

out(['error' => 'Unknown action.'], 400);
