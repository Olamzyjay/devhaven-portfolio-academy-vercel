<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$dataDir = __DIR__ . DIRECTORY_SEPARATOR . 'data';
$storeFile = $dataDir . DIRECTORY_SEPARATOR . 'records.json';
$studentsFile = $dataDir . DIRECTORY_SEPARATOR . 'students.json';

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0775, true);
}

if (!file_exists($storeFile)) {
    file_put_contents($storeFile, json_encode([], JSON_PRETTY_PRINT));
}

if (!file_exists($studentsFile)) {
    file_put_contents($studentsFile, json_encode([], JSON_PRETTY_PRINT));
}

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_PRETTY_PRINT);
    exit;
}

function read_records(string $storeFile): array
{
    $json = file_get_contents($storeFile);
    $records = json_decode($json ?: '[]', true);
    return is_array($records) ? $records : [];
}

function write_records(string $storeFile, array $records): void
{
    $tmp = $storeFile . '.tmp';
    file_put_contents($tmp, json_encode(array_values($records), JSON_PRETTY_PRINT), LOCK_EX);
    rename($tmp, $storeFile);
}

function read_json_array(string $file): array
{
    $json = file_get_contents($file);
    $data = json_decode($json ?: '[]', true);
    return is_array($data) ? $data : [];
}

function write_json_array(string $file, array $data): void
{
    $tmp = $file . '.tmp';
    file_put_contents($tmp, json_encode(array_values($data), JSON_PRETTY_PRINT), LOCK_EX);
    rename($tmp, $file);
}

function body_json(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : [];
}

function clean_string(array $data, string $key): string
{
    return trim((string)($data[$key] ?? ''));
}

function money_value($value): float
{
    $number = is_numeric($value) ? (float)$value : 0.0;
    return $number > 0 ? $number : 0.0;
}

function make_id(string $prefix): string
{
    return $prefix . '-' . gmdate('YmdHis') . '-' . random_int(100, 999);
}

function status_for(float $total, float $paid): string
{
    if ($total <= 0 && $paid <= 0) {
        return 'Draft';
    }
    if ($paid <= 0) {
        return 'Unpaid';
    }
    if ($paid >= $total) {
        return 'Paid';
    }
    return 'Part Payment';
}

function normalize_items(array $items): array
{
    $clean = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $name = trim((string)($item['name'] ?? ''));
        $unitPrice = money_value($item['unitPrice'] ?? 0);
        $qty = money_value($item['qty'] ?? 1);
        if ($qty <= 0) {
            $qty = 1;
        }
        $amount = $unitPrice * $qty;
        if ($name === '' && $amount <= 0) {
            continue;
        }
        $clean[] = [
            'name' => $name,
            'unitPrice' => $unitPrice,
            'qty' => $qty,
            'amount' => $amount,
        ];
    }
    return $clean;
}

function payment_entry(float $amount, array $data, string $label): array
{
    return [
        'amount' => $amount,
        'label' => $label,
        'method' => clean_string($data, 'paymentMethod') ?: 'Cash',
        'reference' => clean_string($data, 'paymentReference'),
        'cashierName' => clean_string($data, 'cashierName'),
        'date' => clean_string($data, 'paymentDate') ?: date('Y-m-d'),
        'createdAt' => gmdate('c'),
    ];
}

function find_record_index(array $records, array $data): int
{
    $id = clean_string($data, 'id');
    $invoiceNo = clean_string($data, 'invoiceNo');
    foreach ($records as $index => $record) {
        if ($id !== '' && ($record['id'] ?? '') === $id) {
            return $index;
        }
        if ($invoiceNo !== '' && ($record['invoiceNo'] ?? '') === $invoiceNo) {
            return $index;
        }
    }

    $admissionNo = strtolower(clean_string($data, 'admissionNo'));
    $class = strtolower(clean_string($data, 'studentClass'));
    $termSession = strtolower(clean_string($data, 'termSession'));
    if ($admissionNo === '' || $class === '' || $termSession === '') {
        return -1;
    }

    foreach ($records as $index => $record) {
        $sameStudent = strtolower((string)($record['admissionNo'] ?? '')) === $admissionNo;
        $sameClass = strtolower((string)($record['studentClass'] ?? '')) === $class;
        $sameTerm = strtolower((string)($record['termSession'] ?? '')) === $termSession;
        $stillOpen = (float)($record['balance'] ?? 0) > 0;
        if ($sameStudent && $sameClass && $sameTerm && $stillOpen) {
            return $index;
        }
    }
    return -1;
}

function normalize_header(string $header): string
{
    $header = strtolower(trim($header));
    return preg_replace('/[^a-z0-9]+/', '', $header) ?: '';
}

function student_value(array $row, array $headerMap, array $keys): string
{
    foreach ($keys as $key) {
        if (isset($headerMap[$key])) {
            $value = trim((string)($row[$headerMap[$key]] ?? ''));
            if ($value !== '') {
                return $value;
            }
        }
    }
    return '';
}

function normalize_student(array $row, array $headerMap): ?array
{
    $student = [
        'admissionNo' => student_value($row, $headerMap, ['admissionno', 'admissionnumber', 'admno', 'regno', 'registrationnumber']),
        'studentName' => student_value($row, $headerMap, ['studentname', 'name', 'fullname', 'studentfullname']),
        'studentClass' => student_value($row, $headerMap, ['class', 'studentclass', 'currentclass']),
        'parentName' => student_value($row, $headerMap, ['parentname', 'guardianname', 'parentguardian', 'sponsorname']),
        'parentPhone' => student_value($row, $headerMap, ['phone', 'phonenumber', 'parentphone', 'guardianphone', 'telephone']),
        'gender' => student_value($row, $headerMap, ['gender', 'sex']),
        'address' => student_value($row, $headerMap, ['address', 'homeaddress']),
        'updatedAt' => gmdate('c'),
    ];

    if ($student['admissionNo'] === '' && $student['studentName'] === '') {
        return null;
    }
    return $student;
}

function parse_csv_students(string $path): array
{
    $handle = fopen($path, 'rb');
    if (!$handle) {
        return [];
    }
    $headers = fgetcsv($handle);
    if (!is_array($headers)) {
        fclose($handle);
        return [];
    }
    $headerMap = [];
    foreach ($headers as $index => $header) {
        $headerMap[normalize_header((string)$header)] = $index;
    }

    $students = [];
    while (($row = fgetcsv($handle)) !== false) {
        $student = normalize_student($row, $headerMap);
        if ($student !== null) {
            $students[] = $student;
        }
    }
    fclose($handle);
    return $students;
}

function xlsx_cell_value(SimpleXMLElement $cell, array $sharedStrings): string
{
    $type = (string)($cell['t'] ?? '');
    $value = isset($cell->v) ? (string)$cell->v : '';
    if ($type === 's') {
        $index = (int)$value;
        return $sharedStrings[$index] ?? '';
    }
    if ($type === 'inlineStr' && isset($cell->is->t)) {
        return (string)$cell->is->t;
    }
    return $value;
}

function xlsx_col_index(string $cellRef): int
{
    $letters = preg_replace('/[^A-Z]/', '', strtoupper($cellRef));
    $index = 0;
    for ($i = 0; $i < strlen($letters); $i++) {
        $index = $index * 26 + (ord($letters[$i]) - 64);
    }
    return max($index - 1, 0);
}

function parse_xlsx_students(string $path): array
{
    if (!class_exists('ZipArchive')) {
        throw new RuntimeException('XLSX import requires the PHP Zip extension. Please upload CSV or enable ZipArchive.');
    }

    $zip = new ZipArchive();
    if ($zip->open($path) !== true) {
        throw new RuntimeException('Unable to open XLSX file.');
    }

    $sharedStrings = [];
    $sharedXml = $zip->getFromName('xl/sharedStrings.xml');
    if ($sharedXml !== false) {
        $shared = simplexml_load_string($sharedXml);
        if ($shared) {
            foreach ($shared->si as $si) {
                $text = '';
                if (isset($si->t)) {
                    $text = (string)$si->t;
                } elseif (isset($si->r)) {
                    foreach ($si->r as $run) {
                        $text .= (string)$run->t;
                    }
                }
                $sharedStrings[] = $text;
            }
        }
    }

    $sheetXml = $zip->getFromName('xl/worksheets/sheet1.xml');
    $zip->close();
    if ($sheetXml === false) {
        throw new RuntimeException('The XLSX file does not contain sheet1.');
    }

    $sheet = simplexml_load_string($sheetXml);
    if (!$sheet) {
        throw new RuntimeException('Unable to read XLSX sheet.');
    }

    $rows = [];
    foreach ($sheet->sheetData->row as $row) {
        $values = [];
        foreach ($row->c as $cell) {
            $ref = (string)($cell['r'] ?? '');
            $values[xlsx_col_index($ref)] = xlsx_cell_value($cell, $sharedStrings);
        }
        if ($values) {
            ksort($values);
            $max = max(array_keys($values));
            $full = [];
            for ($i = 0; $i <= $max; $i++) {
                $full[] = $values[$i] ?? '';
            }
            $rows[] = $full;
        }
    }

    if (!$rows) {
        return [];
    }
    $headers = array_shift($rows);
    $headerMap = [];
    foreach ($headers as $index => $header) {
        $headerMap[normalize_header((string)$header)] = $index;
    }

    $students = [];
    foreach ($rows as $row) {
        $student = normalize_student($row, $headerMap);
        if ($student !== null) {
            $students[] = $student;
        }
    }
    return $students;
}

function merge_students(array $existing, array $incoming): array
{
    $indexByAdmission = [];
    foreach ($existing as $index => $student) {
        $key = strtolower(trim((string)($student['admissionNo'] ?? '')));
        if ($key !== '') {
            $indexByAdmission[$key] = $index;
        }
    }

    $imported = 0;
    $updated = 0;
    foreach ($incoming as $student) {
        $key = strtolower(trim((string)$student['admissionNo']));
        if ($key !== '' && isset($indexByAdmission[$key])) {
            $existing[$indexByAdmission[$key]] = array_merge($existing[$indexByAdmission[$key]], $student);
            $updated++;
        } else {
            $existing[] = $student;
            if ($key !== '') {
                $indexByAdmission[$key] = count($existing) - 1;
            }
            $imported++;
        }
    }
    return ['students' => $existing, 'imported' => $imported, 'updated' => $updated];
}

$action = $_GET['action'] ?? 'list';
$records = read_records($storeFile);

if ($action === 'list') {
    usort($records, static function ($a, $b) {
        return strcmp((string)($b['savedAt'] ?? ''), (string)($a['savedAt'] ?? ''));
    });
    respond(['ok' => true, 'records' => $records]);
}

if ($action === 'students') {
    $students = read_json_array($studentsFile);
    usort($students, static function ($a, $b) {
        return strcmp((string)($a['studentName'] ?? ''), (string)($b['studentName'] ?? ''));
    });
    respond(['ok' => true, 'students' => $students]);
}

if ($action === 'importStudents') {
    if (!isset($_FILES['studentFile']) || !is_uploaded_file($_FILES['studentFile']['tmp_name'])) {
        respond(['ok' => false, 'error' => 'Upload a CSV or XLSX file.'], 422);
    }

    $name = (string)($_FILES['studentFile']['name'] ?? '');
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    try {
        if ($ext === 'csv') {
            $incoming = parse_csv_students($_FILES['studentFile']['tmp_name']);
        } elseif ($ext === 'xlsx') {
            $incoming = parse_xlsx_students($_FILES['studentFile']['tmp_name']);
        } else {
            respond(['ok' => false, 'error' => 'Only CSV and XLSX files are supported.'], 422);
        }
    } catch (Throwable $error) {
        respond(['ok' => false, 'error' => $error->getMessage()], 422);
    }

    if (!$incoming) {
        respond(['ok' => false, 'error' => 'No valid student rows were found. Check your column headers.'], 422);
    }

    $merged = merge_students(read_json_array($studentsFile), $incoming);
    write_json_array($studentsFile, $merged['students']);
    respond([
        'ok' => true,
        'students' => $merged['students'],
        'imported' => $merged['imported'],
        'updated' => $merged['updated'],
    ]);
}

if ($action === 'save') {
    $data = body_json();
    $items = normalize_items($data['items'] ?? []);
    $total = array_reduce($items, static fn($sum, $item) => $sum + (float)$item['amount'], 0.0);
    $paidNow = money_value($data['paidNow'] ?? 0);
    $previousPaid = money_value($data['previousPaid'] ?? 0);

    if (clean_string($data, 'studentName') === '') {
        respond(['ok' => false, 'error' => 'Student name is required.'], 422);
    }
    if (clean_string($data, 'admissionNo') === '') {
        respond(['ok' => false, 'error' => 'Admission number is required.'], 422);
    }
    if (clean_string($data, 'studentClass') === '') {
        respond(['ok' => false, 'error' => 'Class is required.'], 422);
    }
    if (clean_string($data, 'termSession') === '') {
        respond(['ok' => false, 'error' => 'Term/session is required.'], 422);
    }
    if ($total <= 0) {
        respond(['ok' => false, 'error' => 'At least one fee amount is required.'], 422);
    }

    $index = find_record_index($records, $data);
    $updatedExisting = $index >= 0;
    $existing = $updatedExisting ? $records[$index] : [];
    $payments = is_array($existing['payments'] ?? null) ? $existing['payments'] : [];

    if (!$updatedExisting && $previousPaid > 0) {
        $payments[] = payment_entry($previousPaid, $data, 'Previous payment');
    }
    if ($paidNow > 0) {
        $payments[] = payment_entry($paidNow, $data, 'Current payment');
    }

    $totalPaid = array_reduce($payments, static fn($sum, $payment) => $sum + (float)($payment['amount'] ?? 0), 0.0);
    $balance = max($total - $totalPaid, 0);

    $record = array_merge($existing, [
        'id' => (string)($existing['id'] ?? make_id('AFSS-PAY')),
        'invoiceNo' => (string)($existing['invoiceNo'] ?? make_id('AFSS-INV')),
        'receiptNo' => (string)($existing['receiptNo'] ?? make_id('AFSS-RCPT')),
        'studentName' => clean_string($data, 'studentName'),
        'admissionNo' => clean_string($data, 'admissionNo'),
        'studentClass' => clean_string($data, 'studentClass'),
        'termSession' => clean_string($data, 'termSession'),
        'parentName' => clean_string($data, 'parentName'),
        'parentPhone' => clean_string($data, 'parentPhone'),
        'items' => $items,
        'total' => $total,
        'previousPaid' => max($totalPaid - $paidNow, 0),
        'paidNow' => $paidNow,
        'totalPaid' => $totalPaid,
        'balance' => $balance,
        'status' => status_for($total, $totalPaid),
        'paymentMethod' => clean_string($data, 'paymentMethod') ?: 'Cash',
        'paymentReference' => clean_string($data, 'paymentReference'),
        'cashierName' => clean_string($data, 'cashierName'),
        'paymentDate' => clean_string($data, 'paymentDate') ?: date('Y-m-d'),
        'payments' => $payments,
        'savedAt' => gmdate('c'),
    ]);

    if ($updatedExisting) {
        $records[$index] = $record;
    } else {
        array_unshift($records, $record);
    }

    write_records($storeFile, $records);
    respond(['ok' => true, 'record' => $record, 'updatedExisting' => $updatedExisting]);
}

if ($action === 'delete') {
    $data = body_json();
    $id = clean_string($data, 'id');
    if ($id === '') {
        respond(['ok' => false, 'error' => 'Record id is required.'], 422);
    }
    $records = array_values(array_filter($records, static fn($record) => (string)($record['id'] ?? '') !== $id));
    write_records($storeFile, $records);
    respond(['ok' => true]);
}

respond(['ok' => false, 'error' => 'Unknown action.'], 404);
