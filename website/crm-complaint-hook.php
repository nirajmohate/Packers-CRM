<?php
/*
 * Cloud Packers CRM: send a COPY of every website complaint to the CRM.
 * Nothing in your existing form code is removed or changed: the email is still sent exactly as before.
 *
 * 1) Upload this file to the same folder as the PHP file that SENDS the complaint email
 *    (the form's "action" file, not complaint_submitted.php).
 * 2) Fill in the two lines below. CRM_COMPLAINT_KEY must be exactly the same as COMPLAINT_KEY in Vercel.
 * 3) In that PHP file, just AFTER the line that sends the email (mail(...) or $mail->send()), add these two lines:
 *
 *        require_once __DIR__ . '/crm-complaint-hook.php';
 *        send_complaint_to_crm($_POST);
 *
 * If the CRM is slow or down, the customer still sees the thank-you page (waits at most 15 seconds).
 */
define('CRM_URL', 'https://packers-crm-x4bn.vercel.app/api/public/complaints');
define('CRM_COMPLAINT_KEY', 'PASTE-THE-SAME-LONG-KEY-AS-COMPLAINT_KEY-IN-VERCEL');

function send_complaint_to_crm($fields) {
    if (!function_exists('curl_init')) { error_log('CRM complaint copy: PHP curl is not installed'); return false; }
    $data = array();
    foreach ((array)$fields as $k => $v) {
        if (is_string($v) || is_numeric($v)) { $data[substr((string)$k, 0, 60)] = substr((string)$v, 0, 4000); }
    }
    $data['page_url'] = isset($_SERVER['HTTP_REFERER']) ? substr($_SERVER['HTTP_REFERER'], 0, 300) : '';
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) { error_log('CRM complaint copy: could not encode the form'); return false; }

    $ch = curl_init(CRM_URL);
    curl_setopt_array($ch, array(
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $json,
        CURLOPT_HTTPHEADER => array('Content-Type: application/json', 'X-CRM-Key: ' . CRM_COMPLAINT_KEY),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_TIMEOUT => 15, // the first request after a quiet time can take ~10 s while the CRM wakes up
    ));
    $res = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    crm_complaint_log($code, (string)$res, $err);
    if ($code < 200 || $code >= 300) { error_log('CRM complaint copy failed: HTTP ' . $code . ' ' . substr((string)$res, 0, 200) . ' ' . $err); return false; }
    return true;
}

/*
 * Every send is written to crm-complaint-log.php (same folder) as one line:
 *   time | HTTP code | CRM reply | connection error
 * Open it in Hostinger File Manager to see what happened. It starts with "exit", so nobody can read it from a browser.
 * No customer details are written in it. It keeps only the last ~200 lines.
 */
function crm_complaint_log($code, $reply, $err) {
    $file = __DIR__ . '/crm-complaint-log.php';
    $line = date('Y-m-d H:i:s') . ' | HTTP ' . $code . ' | ' . str_replace(array("\r", "\n"), ' ', substr($reply, 0, 150)) . ' | ' . $err . "\n";
    $old = @file($file) ?: array();
    $old = array_slice(array_filter($old, function ($l) { return strpos($l, '<?php') !== 0; }), -199);
    @file_put_contents($file, "<?php exit; ?>\n" . implode('', $old) . $line, LOCK_EX);
}
