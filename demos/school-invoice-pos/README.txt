AFSS Fee POS System

Open index.html through a PHP-enabled local or web server so the backend can save records:

php -S localhost:8080

Then visit:

http://localhost:8080

Backend storage:

data/records.json
data/students.json

Student import columns:

Admission No, Student Name, Class, Parent Name, Phone, Gender, Address

CSV is supported on all PHP installs. XLSX import requires the PHP Zip extension.

How balance updates work:

1. Create a bill for a student, class, and term/session.
2. Save the first payment.
3. Later, load the same open invoice from Backend Fee Records, enter the new amount paid now, and save again.
4. The backend appends the payment, recalculates total paid, balance, and status.

If the same admission number, class, and term/session still has a balance, a new save also updates that open invoice automatically.
