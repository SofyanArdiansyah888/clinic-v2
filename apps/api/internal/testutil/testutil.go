// Package testutil gives integration tests a freshly migrated and seeded Postgres
// database. It always uses a separate database (TEST_DB_NAME, default clinic_test)
// and skips the test when Postgres is not reachable, e.g. `docker compose up -d postgres`
// has not been run.
package testutil

import (
	"fmt"
	"os"
	"sync"
	"testing"

	"github.com/scaleup/clinic-v2/api/internal/config"
	"github.com/scaleup/clinic-v2/api/internal/server"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	once    sync.Once
	baseCfg *config.Config
	initErr error
)

func open(cfg *config.Config) (*gorm.DB, error) {
	return gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
}

func setup() {
	cfg, err := config.Load()
	if err != nil {
		initErr = err
		return
	}
	main := cfg.DBName
	cfg.DBName = os.Getenv("TEST_DB_NAME")
	if cfg.DBName == "" {
		cfg.DBName = "clinic_test"
	}
	if cfg.DBName == main && os.Getenv("TEST_DB_NAME") == "" {
		initErr = fmt.Errorf("test database %q must differ from DB_NAME", cfg.DBName)
		return
	}
	cfg.AppEnv = "test"

	admin := *cfg
	admin.DBName = "postgres"
	adb, err := open(&admin)
	if err != nil {
		initErr = err
		return
	}
	var exists int64
	adb.Raw("SELECT COUNT(*) FROM pg_database WHERE datname = ?", cfg.DBName).Scan(&exists)
	if exists == 0 {
		if err := adb.Exec(fmt.Sprintf(`CREATE DATABASE "%s"`, cfg.DBName)).Error; err != nil {
			initErr = err
			return
		}
	}
	if sqlDB, err := adb.DB(); err == nil {
		_ = sqlDB.Close()
	}
	baseCfg = cfg
}

// DB returns a connection to an empty, migrated and seeded test database.
// Each call wipes the schema, so tests using it must not run in parallel.
func DB(t *testing.T) (*gorm.DB, *config.Config) {
	t.Helper()
	once.Do(setup)
	if initErr != nil {
		t.Skipf("integration test skipped, Postgres not available: %v", initErr)
	}
	db, err := open(baseCfg)
	if err != nil {
		t.Skipf("integration test skipped, Postgres not available: %v", err)
	}
	if err := db.Exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public").Error; err != nil {
		t.Fatalf("reset schema: %v", err)
	}
	if err := server.AutoMigrate(db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if err := server.Seed(db); err != nil {
		t.Fatalf("seed: %v", err)
	}
	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	cfg := *baseCfg
	cfg.StorageLocalDir = t.TempDir()
	return db, &cfg
}
