package main

import (
	"log"

	"github.com/scaleup/clinic-v2/api/internal/config"
	"github.com/scaleup/clinic-v2/api/internal/platform/db"
	"github.com/scaleup/clinic-v2/api/internal/platform/generator"
	"github.com/scaleup/clinic-v2/api/internal/platform/jwt"
	"github.com/scaleup/clinic-v2/api/internal/server"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	database, err := db.Connect(cfg)
	if err != nil {
		log.Fatalf("db: %v", err)
	}

	if cfg.AutoMigrate {
		if err := server.AutoMigrate(database); err != nil {
			log.Fatalf("migrate: %v", err)
		}
		log.Println("migrate: ok")
	}

	if cfg.SeedOnStartup {
		if err := server.Seed(database); err != nil {
			log.Fatalf("seed: %v", err)
		}
	}

	jm := jwt.NewManager(cfg.JWTSecret, cfg.JWTAccessTTL, cfg.JWTRefreshTTL)
	gen := generator.New(database)
	r := server.New(cfg, database, jm, gen)

	log.Printf("Clinic API listening on :%s", cfg.AppPort)
	if err := r.Run(":" + cfg.AppPort); err != nil {
		log.Fatalf("server: %v", err)
	}
}
