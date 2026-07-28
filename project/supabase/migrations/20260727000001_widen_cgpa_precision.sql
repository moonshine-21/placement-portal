/*
# Widen profiles.cgpa precision

## Problem
`profiles.cgpa` was defined as `numeric(3,2)`, which can only store values up
to 9.99. On a 10-point CGPA scale (common in Indian universities), a student
with a perfect 10.0 CGPA would hit a Postgres numeric-overflow error on save
— the frontend didn't surface this error, so it silently looked like "Save
Profile" just wasn't working.

## Fix
Widen the column to `numeric(4,2)` (up to 99.99, comfortably covers 0–10).
*/

ALTER TABLE profiles ALTER COLUMN cgpa TYPE numeric(4,2);
