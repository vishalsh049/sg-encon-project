-- NSO Fiber Performance Dashboard schema

CREATE TABLE IF NOT EXISTS nso_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_id INT NULL,
  circle VARCHAR(255) NULL,
  cmp VARCHAR(255) NULL,
  week VARCHAR(50) NULL,
  year VARCHAR(50) NULL,
  month VARCHAR(50) NULL,
  ticket_no VARCHAR(255) NULL,
  mttr DECIMAL(10,2) NULL,
  ftkm DECIMAL(10,2) NULL,
  scope VARCHAR(255) NULL,
  report_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_nso_circle(circle),
  INDEX idx_nso_cmp(cmp),
  INDEX idx_nso_year(year),
  INDEX idx_nso_month(month),
  INDEX idx_nso_week(week),
  INDEX idx_nso_report_date(report_date)
);

CREATE TABLE IF NOT EXISTS nso_report_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  uploaded_by VARCHAR(255),
  total_records INT DEFAULT 0,
  report_date DATE NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
