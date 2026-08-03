-- ============================================================================
-- Tower Reports — performance indexes
-- ============================================================================
-- WHY THIS IS NEEDED
--
-- The report tables already have indexes, but every one of them puts `file_id`
-- as the SECOND column of a composite index, e.g. idx_enb_date_file(date, file_id).
-- A composite index can only be used when the query filters on its FIRST column,
-- so a lookup of `WHERE file_id = ?` cannot use it and falls back to a full scan.
--
-- `WHERE file_id = ?` is the single hottest query in this module. It runs in:
--   * isUploadAccessible()  — once PER upload row, on every page load
--   * GET /download/:id
--   * deleteUploadData()
--
-- With 391 uploads in report_uploads and enb at ~4.0M rows / 933 MB, loading the
-- Tower Reports page performs on the order of 391 full scans of the largest
-- tables. These indexes turn each of those into a direct lookup.
--
-- SAFETY
--   * Adding an index does NOT read, change or delete any row data.
--   * It is fully reversible: DROP INDEX (rollback statements at the bottom).
--   * It needs temporary disk space roughly proportional to the indexed column.
--
-- BEFORE RUNNING
--   * Take a database backup (you have already done this).
--   * Run during a quiet period. Building an index locks the table for writes;
--     enb (933 MB) is the slowest and may take a few minutes.
--   * Run the statements ONE AT A TIME so you can stop if anything looks wrong.
--
-- HOW TO RUN
--   mysql -h <host> -P <port> -u <user> -p <database> < tower-reports-indexes.sql
--   ...or paste each statement into phpMyAdmin one by one.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- STEP 1 — the critical one: file_id as a LEADING column
-- Run these first. This is where nearly all the speed-up comes from.
-- ---------------------------------------------------------------------------

-- Largest table. Expect this one to take the longest.
ALTER TABLE enb    ADD INDEX idx_enb_file_id    (file_id);

-- Matches GET /api/reports/export-excel:
-- WHERE date BETWEEN ? AND ? ORDER BY date ASC, id ASC.
-- The existing (date, file_id) index cannot supply this ordering.
ALTER TABLE enb    ADD INDEX idx_enb_export_date_id (date, id);

ALTER TABLE gnb    ADD INDEX idx_gnb_file_id    (file_id);
ALTER TABLE osc    ADD INDEX idx_osc_file_id    (file_id);
ALTER TABLE hpodsc ADD INDEX idx_hpodsc_file_id (file_id);
ALTER TABLE esc    ADD INDEX idx_esc_file_id    (file_id);
ALTER TABLE ag2    ADD INDEX idx_ag2_file_id    (file_id);
ALTER TABLE ila    ADD INDEX idx_ila_file_id    (file_id);

-- These tables are currently empty, so they complete instantly.
ALTER TABLE ag1    ADD INDEX idx_ag1_file_id    (file_id);
ALTER TABLE isc    ADD INDEX idx_isc_file_id    (file_id);
ALTER TABLE gsc    ADD INDEX idx_gsc_file_id    (file_id);
ALTER TABLE wifi   ADD INDEX idx_wifi_file_id   (file_id);


-- ---------------------------------------------------------------------------
-- STEP 2 — report_uploads (only 391 rows, so these are instant)
-- Speeds up the report list and the duplicate check during upload.
-- ---------------------------------------------------------------------------

ALTER TABLE report_uploads ADD INDEX idx_uploads_listing (site_category, report_date);
ALTER TABLE report_uploads ADD INDEX idx_uploads_dupe    (site_category, site_type, report_type, report_date);
ALTER TABLE report_uploads ADD INDEX idx_uploads_file_id (file_id);


-- ---------------------------------------------------------------------------
-- STEP 3 — circle filtering (optional, do only if circle filters feel slow)
-- ag2 / ila have no circle index at all today.
-- ---------------------------------------------------------------------------

ALTER TABLE ag2    ADD INDEX idx_ag2_circle_date    (circle, date);
ALTER TABLE ila    ADD INDEX idx_ila_circle_date    (circle, date);
ALTER TABLE gnb    ADD INDEX idx_gnb_circle_date    (circle, date);
ALTER TABLE hpodsc ADD INDEX idx_hpodsc_circle_date (circle, date);


-- ---------------------------------------------------------------------------
-- VERIFY — run after the steps above. Every table should now list a *_file_id index.
-- ---------------------------------------------------------------------------
-- SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
--   FROM INFORMATION_SCHEMA.STATISTICS
--  WHERE TABLE_SCHEMA = DATABASE()
--    AND TABLE_NAME IN ('ag1','ag2','enb','esc','gnb','gsc','hpodsc','ila','isc','osc','wifi','report_uploads')
--  GROUP BY TABLE_NAME, INDEX_NAME
--  ORDER BY TABLE_NAME;


-- ---------------------------------------------------------------------------
-- ROLLBACK — if anything goes wrong, these undo everything above.
-- Dropping an index also does not touch row data.
-- ---------------------------------------------------------------------------
-- ALTER TABLE enb    DROP INDEX idx_enb_file_id;
-- ALTER TABLE enb    DROP INDEX idx_enb_export_date_id;
-- ALTER TABLE gnb    DROP INDEX idx_gnb_file_id;
-- ALTER TABLE osc    DROP INDEX idx_osc_file_id;
-- ALTER TABLE hpodsc DROP INDEX idx_hpodsc_file_id;
-- ALTER TABLE esc    DROP INDEX idx_esc_file_id;
-- ALTER TABLE ag2    DROP INDEX idx_ag2_file_id;
-- ALTER TABLE ila    DROP INDEX idx_ila_file_id;
-- ALTER TABLE ag1    DROP INDEX idx_ag1_file_id;
-- ALTER TABLE isc    DROP INDEX idx_isc_file_id;
-- ALTER TABLE gsc    DROP INDEX idx_gsc_file_id;
-- ALTER TABLE wifi   DROP INDEX idx_wifi_file_id;
-- ALTER TABLE report_uploads DROP INDEX idx_uploads_listing;
-- ALTER TABLE report_uploads DROP INDEX idx_uploads_dupe;
-- ALTER TABLE report_uploads DROP INDEX idx_uploads_file_id;
-- ALTER TABLE ag2    DROP INDEX idx_ag2_circle_date;
-- ALTER TABLE ila    DROP INDEX idx_ila_circle_date;
-- ALTER TABLE gnb    DROP INDEX idx_gnb_circle_date;
-- ALTER TABLE hpodsc DROP INDEX idx_hpodsc_circle_date;
