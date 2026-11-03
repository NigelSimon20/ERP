-- All 311 existing guards were imported with a Force Number (e.g. RS0207)
-- but no Employee Number at all (employee_code was NULL for every one of
-- them) -- confirmed via direct query, not just a hypothesis. User chose to
-- backfill by reusing each Force Number's numeric part rather than fresh
-- sequential numbering, so an employee's number stays tied to the sequence
-- they've had since hire. Verified beforehand: every force_number ends in
-- digits and no two guards share the same trailing digits, so this can't
-- introduce collisions.
UPDATE guards g
SET employee_code = COALESCE(c.employee_code_prefix, 'EMP') || '-' || LPAD((regexp_match(g.force_number, '(\d+)$'))[1], 4, '0')
FROM companies c
WHERE g."companyId" = c.id
  AND g.employee_code IS NULL
  AND g.force_number ~ '\d+$';

-- Keep each company's atomic counter ahead of whatever was just backfilled,
-- so a newly-created employee never collides with a backfilled code.
UPDATE companies c
SET next_employee_number = GREATEST(
  c.next_employee_number,
  COALESCE((
    SELECT MAX((regexp_match(g.employee_code, '(\d+)$'))[1]::int) + 1
    FROM guards g
    WHERE g."companyId" = c.id AND g.employee_code ~ '\d+$'
  ), 1)
);
