-- Candidate SQL Server diagnostics for the current Aldara schema.
-- NOT EXECUTED. Review schema/migrations and use a consistent test copy.
-- Aggregate diagnostics only; no patient identifiers or clinical notes.
-- No mutations, NOLOCK, migration or production connection included.

-- Confirm mapped table names before the following queries.
SELECT TABLE_SCHEMA, TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
  AND TABLE_NAME IN ('Admissions','Beds','Invoices','Payments',
                    'ProductBatches','AccountingEntries','AccountingEntryLines','CashMovements');

-- Active admissions per bed: more than one is a candidate integrity exception.
SELECT BedId, COUNT_BIG(*) AS ActiveAdmissions
FROM dbo.Admissions
WHERE DischargedAt IS NULL AND IsDeleted = 0
GROUP BY BedId HAVING COUNT_BIG(*) > 1;

-- Multiple active admissions per patient, without disclosing patient identity.
SELECT COUNT_BIG(*) AS PatientsWithMultipleActiveAdmissions
FROM (
    SELECT PatientId FROM dbo.Admissions
    WHERE DischargedAt IS NULL AND IsDeleted = 0
    GROUP BY PatientId HAVING COUNT_BIG(*) > 1
) AS findings;

-- Outstanding balance / overpayment from all effective payment rows.
SELECT i.Id AS InvoiceId, i.TotalAmount,
       COALESCE(p.Paid,0) AS Paid,
       i.TotalAmount - COALESCE(p.Paid,0) AS Outstanding
FROM dbo.Invoices AS i
LEFT JOIN (
    SELECT InvoiceId, SUM(Amount) AS Paid
    FROM dbo.Payments WHERE IsDeleted = 0 GROUP BY InvoiceId
) AS p ON p.InvoiceId = i.Id
WHERE i.IsDeleted = 0 AND COALESCE(p.Paid,0) > i.TotalAmount;

-- Stock impossible numerically. Quality/expiry validity needs separate policy.
SELECT COUNT_BIG(*) AS NegativeStockBatches
FROM dbo.ProductBatches WHERE IsDeleted = 0 AND QuantityOnHand < 0;

-- Journal imbalance, including empty journal entries.
SELECT e.Id AS EntryId,
       COALESCE(SUM(l.Debit),0) AS Debit,
       COALESCE(SUM(l.Credit),0) AS Credit,
       COUNT(l.Id) AS Lines
FROM dbo.AccountingEntries AS e
LEFT JOIN dbo.AccountingEntryLines AS l ON l.AccountingEntryId = e.Id
WHERE e.IsDeleted = 0
GROUP BY e.Id
HAVING COALESCE(SUM(l.Debit),0) <> COALESCE(SUM(l.Credit),0)
    OR COUNT(l.Id) = 0;

-- Full cash aggregate. Set an explicit period after timezone/date-policy review.
-- Compare to UI using identical bounds; more than 300 rows exposes truncation risk.
DECLARE @From datetime2 = '2026-01-01T00:00:00';
DECLARE @To datetime2 = '2027-01-01T00:00:00';
SELECT MovementType, COUNT_BIG(*) AS Movements, SUM(Amount) AS Amount
FROM dbo.CashMovements
WHERE IsDeleted = 0 AND MovementDate >= @From AND MovementDate < @To
GROUP BY MovementType;
