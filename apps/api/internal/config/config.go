package config

import (
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv            string
	AppPort           string
	DBHost            string
	DBPort            string
	DBUser            string
	DBPassword        string
	DBName            string
	DBSSLMode         string
	JWTSecret         string
	JWTAccessTTL      time.Duration
	JWTRefreshTTL     time.Duration
	CORSOrigin        string
	AutoMigrate       bool
	SeedOnStartup     bool
	StorageDriver     string // local | minio (minio driver wired later)
	StorageLocalDir   string
	StoragePublicBase string
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	accessHours, _ := strconv.Atoi(getEnv("JWT_ACCESS_TTL_HOURS", "24"))
	refreshDays, _ := strconv.Atoi(getEnv("JWT_REFRESH_TTL_DAYS", "7"))
	autoMigrate := getEnv("AUTO_MIGRATE", "true") == "true"
	seed := getEnv("SEED_ON_STARTUP", "true") == "true"

	return &Config{
		AppEnv:            getEnv("APP_ENV", "development"),
		AppPort:           getEnv("APP_PORT", "8080"),
		DBHost:            getEnv("DB_HOST", "localhost"),
		DBPort:            getEnv("DB_PORT", "5432"),
		DBUser:            getEnv("DB_USER", "clinic"),
		DBPassword:        getEnv("DB_PASSWORD", "clinic"),
		DBName:            getEnv("DB_NAME", "clinic"),
		DBSSLMode:         getEnv("DB_SSLMODE", "disable"),
		JWTSecret:         getEnv("JWT_SECRET", "clinic-v2-dev-secret-change-me"),
		JWTAccessTTL:      time.Duration(accessHours) * time.Hour,
		JWTRefreshTTL:     time.Duration(refreshDays) * 24 * time.Hour,
		CORSOrigin:        getEnv("CORS_ORIGIN", "http://localhost:5173"),
		AutoMigrate:       autoMigrate,
		SeedOnStartup:     seed,
		StorageDriver:     getEnv("STORAGE_DRIVER", "local"),
		StorageLocalDir:   getEnv("STORAGE_LOCAL_DIR", "./storage/uploads"),
		StoragePublicBase: getEnv("STORAGE_PUBLIC_BASE", "/api/uploads/files"),
	}, nil
}

func (c *Config) DSN() string {
	return "host=" + c.DBHost +
		" user=" + c.DBUser +
		" password=" + c.DBPassword +
		" dbname=" + c.DBName +
		" port=" + c.DBPort +
		" sslmode=" + c.DBSSLMode +
		" TimeZone=Asia/Jakarta"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
